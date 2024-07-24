const ethers = require('ethers');
require('dotenv').config();
const ERC20ABI = require('./abi/ERC20.json'); 
const BerachainRewardsVaultFactoryABI = require('./abi/BerachainRewardsVaultFactory.json');

const provider = new ethers.JsonRpcProvider(`${process.env.RPC}`);
const wallet = new ethers.Wallet(`${process.env.PRIVATE_KEY}`, provider);

const factoryAddress = '0xYourFactoryAddress'; 
const factory = new ethers.Contract(factoryAddress, BerachainRewardsVaultFactoryABI, wallet);

async function main() {
  const ERC20Factory = new ethers.ContractFactory(ERC20ABI, wallet);
  const erc20 = await ERC20Factory.deploy("MyToken", "MTK", 18, ethers.utils.parseEther("1000000"));
  await erc20.deployed();
  console.log('ERC20 token deployed at:', erc20.address);


  console.log('Creating rewards vault...');
  const createVaultTx = await factory.createRewardsVault(erc20.address);
  const receipt = await createVaultTx.wait();
  const event = receipt.events.find(event => event.event === 'VaultCreated');
  const vaultAddress = event.args.vault;
  console.log('Rewards vault created at:', vaultAddress);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});