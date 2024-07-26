// Import required libraries and configurations
const ethers = require('ethers');
require('dotenv').config();
const ERC20ABI = require('./abi/ERC20.json');
const BerachainRewardsVaultFactoryABI = require('./abi/BerachainRewardsVaultFactory.json');

// Set up the Ethereum provider and wallet
const provider = new ethers.JsonRpcProvider(`${process.env.RPC}`);
const wallet = new ethers.Wallet(`${process.env.MY_PRIVATE_KEY}`, provider);

// Set up contract instances
const factoryAddress = process.env.FACTORY_ADDRESS;
const factory = new ethers.Contract(factoryAddress, BerachainRewardsVaultFactoryABI, wallet);
const token = new ethers.Contract(process.env.YOUR_TOKEN_ADDRESS, ERC20ABI, wallet);

async function main() {
  // Get the address of the token for which we're creating a rewards vault
  const tokenAddress = await token.getAddress();

  console.log('Creating rewards vault...');
  // Call the createRewardsVault function on the factory contract
  const createVaultTx = await factory.createRewardsVault(tokenAddress);
  // Wait for the transaction to be mined
  await createVaultTx.wait();

  // Predict the address of the newly created rewards vault
  const vaultAddress = await factory.predictRewardsVaultAddress(tokenAddress);
  console.log('Rewards vault created at:', vaultAddress);
}

// Run the main function and handle any errors
main().catch((error) => {
  console.error(error);
  process.exit(1);
});