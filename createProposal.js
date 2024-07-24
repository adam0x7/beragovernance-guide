const ethers = require('ethers');
require('dotenv').config();
const BeraChefABI = require('./abi/BeraChef.json');
const BerachainGovernanceABI = require('./abi/BerachainGovernance.json');
const BGTABI = require('./abi/BGT.json');
const BlockRewardControllerABI = require('./abi/BlockRewardController.json');
const BerachainRewardsVaultABI = require('./abi/BerachainRewardsVault.json');

const provider = new ethers.JsonRpcProvider(`${process.env.RPC}`);
const wallet = new ethers.Wallet(`${process.env.PRIVATE_KEY}`, provider);

const governance = new ethers.Contract('0xE3EDa03401Cf32010a9A9967DaBAEe47ed0E1a0b', BerachainGovernanceABI, wallet);

const beraChef = new ethers.Contract('0xfb81E39E3970076ab2693fA5C45A07Cc724C93c2', BeraChefABI, wallet);
const beraChefInterface = new ethers.Interface(BeraChefABI);
const rewardsVault = new ethers.Contract('0x94Ed9Bb29cad9ed0babbE9b1fEc09F8F66761E5b', BerachainRewardsVaultABI, wallet);
const isFriend = true;
const bgt = new ethers.Contract('0xbDa130737BDd9618301681329bF2e46A016ff9Ad', BGTABI, wallet);

async function checkExistingProposal(targets, values, calldatas, descriptionHash) {
  const proposalId = await governance.hashProposal(targets, values, calldatas, descriptionHash);
  const state = await governance.state(proposalId);
  return state !== 3; // 3 is typically the state for non-existent proposals
}

async function waitForProposalState(proposalId, targetState) {
  while (true) {
    const currentState = await governance.state(proposalId);
    console.log('Current proposal state:', currentState);
    if (currentState === targetState) {
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds before checking again
  }
}

async function main() {
  const beraChefAddress = await beraChef.getAddress();
  const friendAddress = await rewardsVault.getAddress();
  const isFriend = true;
  const targets = [beraChefAddress];
  const values = [0];

  // Check BGT balance
  const balance = await bgt.balanceOf(wallet.address);
  console.log('BGT balance:', balance.toString());

  // Check current delegation and voting power
  const currentDelegatee = await bgt.delegates(wallet.address);
  console.log('Current delegatee:', currentDelegatee);

  const votingPower = await governance.getVotes(wallet.address, await provider.getBlockNumber() - 1);
  console.log('Your voting power:', votingPower.toString());

  const proposalThreshold = await governance.proposalThreshold();
  console.log('Proposal threshold:', proposalThreshold.toString());

  if (votingPower < proposalThreshold) {
    console.log('Voting power is less than proposal threshold');
    if (currentDelegatee !== wallet.address) {
      console.log('Delegating all BGT to self...');
      const delegateTx = await bgt.delegate(wallet.address);
      await delegateTx.wait();
      console.log('Delegation complete');
    } else {
      console.log('Already delegated to self, but still not enough voting power');
      console.log('Please acquire more BGT tokens to meet the proposal threshold');
      return;
    }
  } else {
    console.log('Voting power is sufficient to create a proposal');
  }

  // Check voting power again after potential delegation
  const updatedVotingPower = await governance.getVotes(wallet.address, await provider.getBlockNumber() - 1);
  console.log('Updated voting power:', updatedVotingPower.toString());

  if (updatedVotingPower < proposalThreshold) {
    console.log('Voting power is still less than proposal threshold, cannot create proposal');
    return;
  }

  console.log('Friend', friendAddress);
  console.log('targets', isFriend);
  const calldatas = [
    beraChefInterface.encodeFunctionData('updateFriendsOfTheChef', [friendAddress, isFriend])
  ];
  const description = "Update friends of the chef";

  console.log('Creating proposal...');
  console.log('Targets:', targets);
  const hash = ethers.id(description);

  const proposalExists = await checkExistingProposal(targets, values, calldatas, hash);
  let proposalId;

  if (proposalExists) {
    console.log('A proposal with these parameters already exists. Continuing with the existing proposal.');
    proposalId = await governance.hashProposal(targets, values, calldatas, hash);
  } else {
    try {
      console.log('Proposing with:', { targets, values, calldatas, description });
      const tx = await governance.propose(targets, values, calldatas, description);
      const receipt = await tx.wait();
      proposalId = await governance.hashProposal(targets, values, calldatas, hash);
      console.log('Proposal created with ID:', proposalId);
    } catch (error) {
      console.error('Error creating proposal:', error);
      if (error.error && error.error.data) {
        try {
          const decodedError = governance.interface.parseError(error.error.data);
          console.error('Decoded error:', decodedError);
        } catch (parseError) {
          console.error('Could not parse error:', error.error.data);
        }
      }
      console.log('Proposal details:');
      console.log('Targets:', targets);
      console.log('Values:', values);
      console.log('Calldatas:', calldatas);
      console.log('Description:', description);
      return;
    }
  }

  // Check the current state of the proposal
  const proposalState = await governance.state(proposalId);
  console.log('Current proposal state:', proposalState);

  // Continue with the rest of the process based on the proposal state
  if (proposalState === 0) { // Pending state
    const votingDelay = await governance.votingDelay();
    console.log(`Waiting for voting delay: ${votingDelay} blocks`);
    await provider.waitForBlock(await provider.getBlockNumber() + votingDelay.toNumber());
  } else {
    console.log('Proposal is past the voting delay period');
  }

  console.log('Checking if vote has already been cast...');
  const hasVoted = await governance.hasVoted(proposalId, wallet.address);

  if (hasVoted) {
    console.log('Vote already cast for this proposal. Proceeding to next step.');
  } else {
    console.log('Casting vote...');
    try {
      const voteTx = await governance.castVote(proposalId, 1);
      await voteTx.wait();
      console.log('Vote cast successfully');
    } catch (error) {
      console.error('Error casting vote:', error);
      return;
    }
  }

  console.log('Waiting for voting period to end...');
  await waitForProposalState(proposalId, 4); // 4 is typically the state for Succeeded proposals
  console.log('Voting period has ended.');

  console.log('Queueing proposal...');
  const descriptionHash = ethers.id(description);
  const queueTx = await governance.queue(targets, values, calldatas, descriptionHash);
  await queueTx.wait();
  console.log('Proposal queued');

  const timelock = await governance.timelock();
  const delay = await timelock.getMinDelay();
  console.log(`Waiting for timelock delay: ${delay} seconds`);
  await new Promise(resolve => setTimeout(resolve, delay.toNumber() * 1000));

  console.log('Executing proposal...');
  const executeTx = await governance.execute(targets, values, calldatas, descriptionHash);
  await executeTx.wait();
  console.log('Proposal executed successfully');

  const isFriendNow = await BeraChefABI.isFriendOfTheChef(friendAddress);
  console.log('Is address friend of the chef:', isFriendNow);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});