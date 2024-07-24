const ethers = require('ethers');
require('dotenv').config();
const ERC20ABI = require('./abi/ERC20.json');
const BerachainRewardsVaultFactoryABI = require('./abi/BerachainRewardsVaultFactory.json');

const provider = new ethers.JsonRpcProvider(`${process.env.RPC}`);
const wallet = new ethers.Wallet(`${process.env.MY_PRIVATE_KEY}`, provider);

const factoryAddress = process.env.FACTORY_ADDRESS;
const factory = new ethers.Contract(factoryAddress, BerachainRewardsVaultFactoryABI, wallet);
const token = new ethers.Contract(process.env.YOUR_TOKEN_ADDRESS, ERC20ABI, wallet);

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