const ethers = require('ethers');
require('dotenv').config();
const ERC20ABI = require('./abi/ERC20.json');
const BerachainRewardsVaultFactoryABI = require('./abi/BerachainRewardsVaultFactory.json');

const provider = new ethers.JsonRpcProvider(`${process.env.RPC}`);
const wallet = new ethers.Wallet(`${process.env.MY_PRIVATE_KEY}`, provider);

const factoryAddress = '0x2B6e40f65D82A0cB98795bC7587a71bfa49fBB2B';
const factory = new ethers.Contract(factoryAddress, BerachainRewardsVaultFactoryABI, wallet);
const token = new ethers.Contract('0xe1B93386237F8fE86B8022ef225fA9b2cd6Bee4b', ERC20ABI, wallet);

async function main() {
  const tokenAddress = await token.getAddress();

  console.log('Creating rewards vault...');
  const createVaultTx = await factory.createRewardsVault(tokenAddress);
  await createVaultTx.wait();

  const vaultAddress = await factory.predictRewardsVaultAddress(tokenAddress);
  console.log('Rewards vault created at:', vaultAddress);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});