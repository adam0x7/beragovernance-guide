const ethers = require('ethers');
require('dotenv').config();
const BeraChefABI = require('./abi/BeraChef.json');
const BerachainGovernanceABI = require('./abi/BerachainGovernance.json');
const BGTABI = require('./abi/BGT.json');
const BerachainRewardsVaultABI = require('./abi/BerachainRewardsVault.json');

const provider = new ethers.JsonRpcProvider(process.env.RPC);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const governance = new ethers.Contract('0xE3EDa03401Cf32010a9A9967DaBAEe47ed0E1a0b', BerachainGovernanceABI, wallet);
const beraChef = new ethers.Contract('0xfb81E39E3970076ab2693fA5C45A07Cc724C93c2', BeraChefABI, wallet);
const beraChefInterface = new ethers.Interface(BeraChefABI);
const rewardsVault = new ethers.Contract('0xeaAcEcB1655bB32909D90B1AbDBe088e9837F261', BerachainRewardsVaultABI, wallet);
const bgt = new ethers.Contract('0xbDa130737BDd9618301681329bF2e46A016ff9Ad', BGTABI, wallet);

async function checkExistingProposal(targets, values, calldatas, descriptionHash) {
  const proposalId = await governance.hashProposal(targets, values, calldatas, descriptionHash);
  try {
    const state = await governance.state(proposalId);
    return state !== 3;
  } catch (error) {
    return error.reason === "GovernorNonexistentProposal(uint256)" ? false : Promise.reject(error);
  }
}

async function waitForProposalState(proposalId, targetState, timeout = 3600000) {
  const stateNames = ['Pending', 'Active', 'Canceled', 'Defeated', 'Succeeded', 'Queued', 'Expired', 'Executed'];
  const startTime = Date.now();
  while (true) {
    const currentState = await governance.state(proposalId);
    console.log(`Current proposal state: ${currentState} (${stateNames[currentState]})`);
    if (currentState === targetState) break;
    if (Date.now() - startTime > timeout) {
      console.log("Waiting on voting period to start. Please try again in a few hours.");
      process.exit(0);
    }
    await new Promise(resolve => setTimeout(resolve, 60000));
  }
}

async function ensureSufficientVotingPower() {
  const balance = await bgt.balanceOf(wallet.address);
  console.log('BGT balance:', balance.toString());

  const currentDelegatee = await bgt.delegates(wallet.address);
  console.log('Current delegatee:', currentDelegatee);

  const votingPower = await governance.getVotes(wallet.address, await provider.getBlockNumber() - 1);
  console.log('Your voting power:', votingPower.toString());

  const proposalThreshold = await governance.proposalThreshold();
  console.log('Proposal threshold:', proposalThreshold.toString());

  if (votingPower < proposalThreshold) {
    if (currentDelegatee !== wallet.address) {
      console.log('Delegating all BGT to self...');
      await (await bgt.delegate(wallet.address)).wait();
      console.log('Delegation complete');
    } else {
      console.log('Already delegated to self, but still not enough voting power');
      console.log('Please acquire more BGT tokens to meet the proposal threshold');
      return false;
    }
  }

  const updatedVotingPower = await governance.getVotes(wallet.address, await provider.getBlockNumber() - 1);
  console.log('Updated voting power:', updatedVotingPower.toString());

  if (updatedVotingPower < proposalThreshold) {
    console.log('Voting power is still less than proposal threshold, cannot create proposal');
    return false;
  }

  return true;
}

async function createProposal(targets, values, calldatas, description) {
  const hash = ethers.id(description);
  const proposalExists = await checkExistingProposal(targets, values, calldatas, hash);

  if (proposalExists) {
    console.log('A proposal with these parameters already exists. Skipping to next steps.');
    return await governance.hashProposal(targets, values, calldatas, hash);
  }

  try {
    console.log('Proposing with:', { targets, values, calldatas, description });
    const tx = await governance.propose(targets, values, calldatas, description);
    const receipt = await tx.wait();
    console.log('Proposal transaction confirmed. Receipt:', receipt);
    const proposalId = await governance.hashProposal(targets, values, calldatas, hash);
    console.log('Proposal created with ID:', proposalId);
    return proposalId;
  } catch (error) {
    console.error('Error creating proposal:', error);
    if (error.error?.data) {
      try {
        console.error('Decoded error:', governance.interface.parseError(error.error.data));
      } catch (parseError) {
        console.error('Could not parse error. Raw error data:', error.error.data);
      }
    }
    throw error;
  }
}

async function castVote(proposalId) {
  const hasVoted = await governance.hasVoted(proposalId, wallet.address);
  if (hasVoted) {
    console.log('Vote already cast for this proposal. Proceeding to next step.');
    return;
  }

  console.log('Casting vote...');
  try {
    const voteTx = await governance.castVote(proposalId, 1);
    const receipt = await voteTx.wait();
    console.log('Vote cast successfully. Transaction hash:', receipt.transactionHash);
  } catch (error) {
    console.error('Error casting vote:', error);
    if (error.error?.data) {
      try {
        console.error('Decoded error:', governance.interface.parseError(error.error.data));
      } catch (parseError) {
        console.error('Could not parse error. Raw error data:', error.error.data);
      }
    }
    throw error;
  }
}

async function main() {
  const beraChefAddress = await beraChef.getAddress();
  const friendAddress = await rewardsVault.getAddress();
  const targets = [beraChefAddress];
  const values = [0];
  const calldatas = [beraChefInterface.encodeFunctionData('updateFriendsOfTheChef', [friendAddress, true])];
  const description = "Update friends of the chef";

  if (!(await ensureSufficientVotingPower())) return;

  const proposalId = await createProposal(targets, values, calldatas, description);

  console.log('Waiting for proposal to become active...');
  await waitForProposalState(proposalId, 1, 3600000); // 1 hour timeout
  console.log('Proposal is now active and ready for voting');

  await castVote(proposalId);

  console.log('Waiting for voting period to end...');
  await waitForProposalState(proposalId, 4);
  console.log('Voting period has ended.');

  console.log('Queueing proposal...');
  const descriptionHash = ethers.id(description);
  await (await governance.queue(targets, values, calldatas, descriptionHash)).wait();
  console.log('Proposal queued');

  const timelock = await governance.timelock();
  const delay = await timelock.getMinDelay();
  console.log(`Waiting for timelock delay: ${delay} seconds`);
  await new Promise(resolve => setTimeout(resolve, delay.toNumber() * 1000));

  console.log('Executing proposal...');
  await (await governance.execute(targets, values, calldatas, descriptionHash)).wait();
  console.log('Proposal executed successfully');

  const isFriendNow = await beraChef.isFriendOfTheChef(friendAddress);
  console.log('Is address friend of the chef:', isFriendNow);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});