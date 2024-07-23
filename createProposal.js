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

async function main() {
  const beraChefAddress = await beraChef.getAddress();
  const friendAddress = await rewardsVault.getAddress();
  const isFriend = true;
  const targets = [beraChefAddress];
  const values = [0];

   // Check BGT balance
   const balance = await bgt.balanceOf(wallet.address);
   console.log('BGT balance:', balance.toString());

   // Check current delegation
   const currentDelegatee = await bgt.delegates(wallet.address);
   console.log('Current delegatee:', currentDelegatee);

   // If not delegated to self, delegate
   if (currentDelegatee !== wallet.address) {
     console.log('Delegating BGT to self...');
     const delegateTx = await bgt.delegate(wallet.address);
     await delegateTx.wait();
     console.log('Delegation complete');
   } else {
     console.log('BGT already delegated to self');
   }


  const proposalThreshold = await governance.proposalThreshold();
  console.log('Proposal threshold:', proposalThreshold.toString());
  
  const votingPower = await governance.getVotes(wallet.address, await provider.getBlockNumber() - 1);
  console.log('Your voting power:', votingPower.toString());

  if (votingPower < proposalThreshold) {
    console.log('Voting power is less than proposal threshold, cannot create proposal');
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
  const tx = await governance.propose(targets, values, calldatas, description);
  const receipt = await tx.wait();
  const proposalId = receipt.events[0].args.proposalId;
  console.log('Proposal created with ID:', proposalId);

  const votingDelay = await governance.votingDelay();
  console.log(`Waiting for voting delay: ${votingDelay} blocks`);
  await provider.waitForTransaction(receipt.transactionHash, votingDelay.toNumber());

  console.log('Casting vote...');
  const voteTx = await governance.castVote(proposalId, 1);
  await voteTx.wait();
  console.log('Vote cast successfully');

  const votingPeriod = await governance.votingPeriod();
  console.log(`Waiting for voting period: ${votingPeriod} blocks`);
  await new Promise(resolve => setTimeout(resolve, votingPeriod.toNumber() * 4000));

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

  const isFriendnOW = await BeraChefABI.isFriendOfTheChef(friendAddress);
  console.log('Is address friend of the chef:', isFriendNow);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
