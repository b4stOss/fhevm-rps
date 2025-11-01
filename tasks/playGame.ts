import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

/**
 * Tutorial: Deploy and Play Rock-Paper-Scissors on Sepolia
 * ===========================================================
 *
 * 1. Deploy the RockPaperScissors contract
 *
 *   npx hardhat --network sepolia deploy
 *
 * 2. Get two player addresses (you'll need two accounts in your mnemonic)
 *
 *   npx hardhat --network sepolia task:accounts
 *
 * 3. Play a game (using player indices from mnemonic)
 *
 *   # Player 1 starts the game with Player 2
 *   npx hardhat --network sepolia task:rps-start --player1 0 --player2 1
 *
 *   # Player 1 submits move (0=Rock, 1=Paper, 2=Scissors)
 *   npx hardhat --network sepolia task:rps-submit --player 0 --move 0
 *
 *   # Player 2 submits move
 *   npx hardhat --network sepolia task:rps-submit --player 1 --move 1
 *
 *   # Anyone can request reveal (after both players submitted)
 *   npx hardhat --network sepolia task:rps-reveal --player 0
 *
 *   # Check the result (0=Draw, 1=Player1 wins, 2=Player2 wins)
 *   npx hardhat --network sepolia task:rps-result
 *
 *   # Reset for a new game
 *   npx hardhat --network sepolia task:rps-reset --player 0
 */

/**
 * Example:
 *   - npx hardhat --network sepolia task:rps-address
 */
task("task:rps-address", "Prints the RockPaperScissors contract address").setAction(
  async function (_taskArguments: TaskArguments, hre) {
    const { deployments } = hre;

    const rps = await deployments.get("RockPaperScissors");

    console.log("RockPaperScissors address:", rps.address);
  },
);

/**
 * Example:
 *   - npx hardhat --network sepolia task:rps-start --player1 0 --player2 1
 */
task("task:rps-start", "Start a new Rock-Paper-Scissors game")
  .addOptionalParam("address", "Optionally specify the contract address")
  .addParam("player1", "Player 1 account index (from mnemonic)")
  .addParam("player2", "Player 2 account index (from mnemonic)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const player1Index = parseInt(taskArguments.player1);
    const player2Index = parseInt(taskArguments.player2);

    if (!Number.isInteger(player1Index) || !Number.isInteger(player2Index)) {
      throw new Error("Player indices must be integers");
    }

    const deployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("RockPaperScissors");

    console.log(`RockPaperScissors: ${deployment.address}`);

    const signers = await ethers.getSigners();
    const player1 = signers[player1Index];
    const player2 = signers[player2Index];

    console.log(`Player 1: ${player1.address}`);
    console.log(`Player 2: ${player2.address}`);

    const rpsContract = await ethers.getContractAt("RockPaperScissors", deployment.address);

    const tx = await rpsContract.connect(player1).startGame(player2.address);
    console.log(`Wait for tx: ${tx.hash}...`);

    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);

    console.log("Game started successfully!");
  });

/**
 * Example:
 *   - npx hardhat --network sepolia task:rps-submit --player 0 --move 0
 *   - npx hardhat --network sepolia task:rps-submit --player 1 --move 1
 */
task("task:rps-submit", "Submit an encrypted move (0=Rock, 1=Paper, 2=Scissors)")
  .addOptionalParam("address", "Optionally specify the contract address")
  .addParam("player", "Player account index (from mnemonic)")
  .addParam("move", "Move: 0=Rock, 1=Paper, 2=Scissors")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    const playerIndex = parseInt(taskArguments.player);
    const move = parseInt(taskArguments.move);

    if (!Number.isInteger(playerIndex)) {
      throw new Error("Player index must be an integer");
    }

    if (!Number.isInteger(move) || move < 0 || move > 2) {
      throw new Error("Move must be 0 (Rock), 1 (Paper), or 2 (Scissors)");
    }

    await fhevm.initializeCLIApi();

    const deployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("RockPaperScissors");

    console.log(`RockPaperScissors: ${deployment.address}`);

    const signers = await ethers.getSigners();
    const player = signers[playerIndex];

    console.log(`Player: ${player.address}`);
    console.log(`Move: ${move === 0 ? "Rock" : move === 1 ? "Paper" : "Scissors"}`);

    const rpsContract = await ethers.getContractAt("RockPaperScissors", deployment.address);

    // Encrypt the move
    const encryptedMove = await fhevm
      .createEncryptedInput(deployment.address, player.address)
      .add8(move)
      .encrypt();

    const tx = await rpsContract.connect(player).submitMove(encryptedMove.handles[0], encryptedMove.inputProof);
    console.log(`Wait for tx: ${tx.hash}...`);

    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);

    console.log("Move submitted successfully!");
  });

/**
 * Example:
 *   - npx hardhat --network sepolia task:rps-reveal --player 0
 *   - npx hardhat --network localhost task:rps-reveal --player 0
 */
task("task:rps-reveal", "Request revelation of the game result")
  .addOptionalParam("address", "Optionally specify the contract address")
  .addParam("player", "Player account index (from mnemonic)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const playerIndex = parseInt(taskArguments.player);

    if (!Number.isInteger(playerIndex)) {
      throw new Error("Player index must be an integer");
    }

    const deployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("RockPaperScissors");

    console.log(`RockPaperScissors: ${deployment.address}`);

    const signers = await ethers.getSigners();
    const player = signers[playerIndex];

    console.log(`Requester: ${player.address}`);

    const rpsContract = await ethers.getContractAt("RockPaperScissors", deployment.address);

    const tx = await rpsContract.connect(player).requestReveal();
    console.log(`Wait for tx: ${tx.hash}...`);

    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);

    console.log("Reveal requested!");

    // In mock mode (localhost/hardhat), simulate oracle callback
    if (fhevm.isMock) {
      console.log("Mock mode detected - triggering decryption oracle simulation...");
      await fhevm.awaitDecryptionOracle();
      console.log("Decryption complete! Use task:rps-result to see the winner.");
    } else {
      console.log("NOTE: The decryption is asynchronous. Wait ~30 seconds, then use task:rps-result to check.");
    }
  });

/**
 * Example:
 *   - npx hardhat --network sepolia task:rps-result
 */
task("task:rps-result", "Check the game result")
  .addOptionalParam("address", "Optionally specify the contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const deployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("RockPaperScissors");

    console.log(`RockPaperScissors: ${deployment.address}`);

    const rpsContract = await ethers.getContractAt("RockPaperScissors", deployment.address);

    const player1 = await rpsContract.player1();
    const player2 = await rpsContract.player2();
    const player1Submitted = await rpsContract.player1Submitted();
    const player2Submitted = await rpsContract.player2Submitted();
    const gameRevealed = await rpsContract.gameRevealed();
    const isDecryptionPending = await rpsContract.isDecryptionPending();
    const result = await rpsContract.result();

    console.log("\n=== Game Status ===");
    console.log(`Player 1: ${player1}`);
    console.log(`Player 2: ${player2}`);
    console.log(`Player 1 submitted: ${player1Submitted}`);
    console.log(`Player 2 submitted: ${player2Submitted}`);
    console.log(`Decryption pending: ${isDecryptionPending}`);
    console.log(`Game revealed: ${gameRevealed}`);

    if (gameRevealed) {
      console.log("\n=== Result ===");
      if (result === 0n) {
        console.log("Draw!");
      } else if (result === 1n) {
        console.log(`Player 1 wins! (${player1})`);
      } else if (result === 2n) {
        console.log(`Player 2 wins! (${player2})`);
      }
    } else if (isDecryptionPending) {
      console.log("\nWaiting for decryption oracle to process the result...");
      console.log("Try again in ~30 seconds.");
    } else if (player1Submitted && player2Submitted) {
      console.log("\nBoth players have submitted. Call task:rps-reveal to compute the result.");
    } else {
      console.log("\nWaiting for players to submit their moves.");
    }
  });

/**
 * Example:
 *   - npx hardhat --network sepolia task:rps-reset --player 0
 */
task("task:rps-reset", "Reset the game for a new round")
  .addOptionalParam("address", "Optionally specify the contract address")
  .addParam("player", "Player account index (from mnemonic)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const playerIndex = parseInt(taskArguments.player);

    if (!Number.isInteger(playerIndex)) {
      throw new Error("Player index must be an integer");
    }

    const deployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("RockPaperScissors");

    console.log(`RockPaperScissors: ${deployment.address}`);

    const signers = await ethers.getSigners();
    const player = signers[playerIndex];

    console.log(`Requester: ${player.address}`);

    const rpsContract = await ethers.getContractAt("RockPaperScissors", deployment.address);

    const tx = await rpsContract.connect(player).resetGame();
    console.log(`Wait for tx: ${tx.hash}...`);

    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);

    console.log("Game reset successfully! You can start a new game now.");
  });
