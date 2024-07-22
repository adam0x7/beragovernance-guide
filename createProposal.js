import { ethers } from 'ethers';
import dotenv from 'dotenv';
import BeraChefABI from '../abi/BeraChef.json' assert {type: 'json'};
import BerachainGovernanceABI from '../abi/BerachainGovernance.json' assert {type: 'json'};
import BGTABI from '../abi/BGT.json' assert {type: 'json'};
import BlockRewardControllerABI from '../abi/BlockRewardController.json' assert {type: 'json'};

dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.BERA_RPC);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const governance = new ethers.Contract(process.env.GOVERNANCE_ADDRESS, BerachainGovernanceABI, wallet);
const bgt = new ethers.Contract(process.env.BGT_ADDRESS, BGTABI, wallet);
const blockRewardController = new ethers.Contract(process.env.BLOCK_REWARD_CONTROLLER_ADDRESS, BlockRewardControllerABI, wallet);

async function main() {
  const targets = [bgt.address, blockRewardController.address];
  const values = [0, 0];
  const calldatas = [
    bgt.interface.encodeFunctionData('whitelistSender', [wallet.address, true]),
    blockRewardController.interface.encodeFunctionData('setRewardRate', [1000])
  ];
  const description = "Test Proposal";

  console.log('Creating proposal...');
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

  const isWhitelisted = await bgt.isWhitelistedSender(wallet.address);
  const rewardRate = await blockRewardController.rewardRate();
  console.log('Is wallet whitelisted:', isWhitelisted);
  console.log('New reward rate:', rewardRate.toString());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
