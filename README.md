# Creating a Governance Proposal for Berachain

## Introduction to Rewards Vaults 

One of the biggest perks of Proof of Liquidity is the ability for protocols to bootstrap their liquidity by getting BGT emissions. This is done through "RewardsVaults". 

**RewardsVaults** are smart contracts that validators send their BGT to in exchange for incentive tokens. They are created by the [RewardsVault Factory](https://bartio.beratrail.io/address/0x2B6e40f65D82A0cB98795bC7587a71bfa49fBB2B), by simply calling the function `createRewardsVault(stakingToken)`.

While it's permissionless to create your own RewardsVault, for validators to emit their BGT to you, you must submit a governance proposal to have your RewardsVault added to BGT station to participate in PoL. This is done by making your RewardsVault a "friend of the chef", which is a collection of the approved RewardsVaults for guages to emit their BGT to. 

This tutorial will show you how to submit your own governance proposal programmatically.

## Understanding The Berachain Governance Process

The Berachain governance contracts inherit from the [Open Zeppelin governance modules](https://docs.openzeppelin.com/contracts/4.x/api/governance). The process begins with either acquiring or being delegated **1000 BGT** (Bera Governance Token) by community members. This is the threshold to create a proposal.

### Proposal Inputs

When a proposal is made to the governance contract, there are 4 inputs:

1. **Targets**: An array containing the address of the contract that our GovernanceContract will be calling (in this tutorial, our BeraChef contract address).
2. **Value**: An array for passing BERA to the governance contract (in our use case, it's just 0).
3. **Calldata**: An array containing the encoded function call to `updateFriendsOfTheChef` on the BeraChef contract.
4. **Description**: The explanation of the proposal's purpose.

### Proposal Lifecycle
1. **Creation**: The proposal is created with the above inputs.
2. **Waiting Period**: 3 hours before becoming active for voting.
3. **Active Voting**: 3 hours for token holders to cast votes (For, Against, or Abstain).
4. **Quorum**: A minimum number of votes must be reached for the proposal to be valid.
5. **Outcome**: The proposal state changes to "Succeeded" or "Defeated" based on voting results.
6. **Queue and Timelock**: If successful, the proposal enters a queue with a timelock delay for safety checks.
7. **Execution**: After the timelock period, any address can trigger the execution.

## Submitting Your Governance Proposal

Follow these steps to submit your proposal using our provided script:

1. Git clone this repository 
2. Copy and paste the .env.example file into your own .env file 
3. Deploy your Incentive Token if you haven't already (standard ERC20 token).
4. Update the `.env` file with the address of your token and other necessary variables:

   ```
   RPC=<Your RPC URL>
   PRIVATE_KEY=<Your Private Key>
   GOVERNANCE_ADDRESS=<Governance Contract Address>
   BERACHEF_ADDRESS=<BeraChef Contract Address>
   REWARDS_VAULT_ADDRESS=<Your RewardsVault Address>
   BGT_ADDRESS=<BGT Token Address>
   ```

5. Run `node createVault` to call the RewardsVault factory and create a vault.

6. Copy the logged RewardsVault address and paste it into your `.env` file for the `REWARDS_VAULT_ADDRESS` variable.

7. Run `node createProposal` to create the proposal for your RewardsVault on-chain. This script will:

   a. Check if you have sufficient voting power:

   ```javascript
   async function ensureSufficientVotingPower() {
     const votingPower = await governance.getVotes(wallet.address, await provider.getBlockNumber() - 1);
     const proposalThreshold = await governance.proposalThreshold();
     if (votingPower < proposalThreshold) {
       await bgt.delegate(wallet.address);
     }
   }
   ```

   b. Create the proposal:

   ```javascript
   async function createProposal(targets, values, calldatas, description) {
     const tx = await governance.propose(targets, values, calldatas, description);
     const receipt = await tx.wait();
     const proposalId = await governance.hashProposal(targets, values, calldatas, ethers.id(description));
     console.log('Proposal created with ID:', proposalId);
     return proposalId;
   }
   ```

   c. Wait for the proposal to become active and cast a vote:

   ```javascript
   async function castVote(proposalId) {
     const voteTx = await governance.castVote(proposalId, 1);
     await voteTx.wait();
     console.log('Vote cast successfully');
   }
   ```

8. Wait until more than 2B BGT has been voted in favor of your proposal. Share your proposal on Twitter and in the Bera buildoors group chat for people to vote!

9. Once quorum is reached and enough "yes" votes are in your favor, the proposal gets "time locked" for 2 days for final security checks.

10. After the timelock period, the script will automatically queue and execute the proposal:

   ```javascript
   console.log('Queueing proposal...');
   await governance.queue(targets, values, calldatas, descriptionHash);

   const timelock = await governance.timelock();
   const delay = await timelock.getMinDelay();
   await new Promise(resolve => setTimeout(resolve, delay.toNumber() * 1000));

   console.log('Executing proposal...');
   await governance.execute(targets, values, calldatas, descriptionHash);
   ```

By following these steps and using the provided script, you can programmatically submit a governance proposal to add your RewardsVault as a friend of BeraChef, allowing it to participate in the distribution of rewards.