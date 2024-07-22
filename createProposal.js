import { ethers } from 'ethers';
import dotenv from 'dotenv';
import BeraChefABI from '../abi/BeraChef.json' assert {type: 'json'};
import BerachainGovernanceABI from '../abi/BerachainGovernance.json' assert {type: 'json'};
import BGTABI from '../abi/BGT.json' assert {type: 'json'};
import BlockRewardControllerABI from '../abi/BlockRewardController.json' assert {type: 'json'};

dotenv.config();

const provider = new ethers.JsonRpcProvider(`insert rpc from env file`);
const wallet = new ethers.Wallet('insert private key from env file', provider);

const governance = new ethers.Contract('0xE3EDa03401Cf32010a9A9967DaBAEe47ed0E1a0b', BerachainGovernanceABI, wallet);

const beraChef = new ethers.Contract('0xfb81E39E3970076ab2693fA5C45A07Cc724C93c2', BeraChefABI, wallet);
const rewardsVault = new ethers.Contract('0x94Ed9Bb29cad9ed0babbE9b1fEc09F8F66761E5b', BerachainRewardsVaultABI, wallet);
const isFriend = true;

async function main() {
  const beraChefAddress = beraChef.getAddress(); 
  const friendAddress = rewardsVault.getAddress();
  const isFriend = true;

  const targets = [beraChefAddress];
  const values = [0];
  const calldatas = [
    BeraChefABI.encodeFunctionData('updateFriendsOfTheChef', [friendAddress, isFriend])
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
