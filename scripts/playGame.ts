/**
 * Rock Paper Scissors FHE Demo Script
 *
 * This script demonstrates a complete game flow with encrypted moves.
 *
 * USAGE:
 *   npm run demo:duo
 *   (or: npx hardhat test test/RockPaperScissors.demo.ts)
 *
 * IMPORTANT: Do NOT run with `hardhat run` as the FHEVM plugin
 * requires initialization via the test runner.
 *
 * This script is imported by test/RockPaperScissors.demo.ts which provides
 * the necessary FHEVM environment setup.
 */

import { ethers, fhevm } from "hardhat";
import { RockPaperScissors } from "../types";

// Move encoding
const MOVES = {
  ROCK: 0,
  PAPER: 1,
  SCISSORS: 2,
} as const;

const MOVE_NAMES = ["Rock", "Paper", "Scissors"];
const RESULT_NAMES = ["Draw", "Player 1 wins", "Player 2 wins"];

async function runDemo() {
  console.log("\n🎮 Rock Paper Scissors - FHE Demo\n");
  console.log("================================\n");

  // Get signers (Alice and Bob)
  const [alice, bob] = await ethers.getSigners();

  console.log("👥 Players:");
  console.log(`   Alice: ${alice.address}`);
  console.log(`   Bob:   ${bob.address}\n`);

  // Deploy contract
  console.log("📝 Deploying RockPaperScissors contract...");
  const factory = await ethers.getContractFactory("RockPaperScissors");
  const contract = (await factory.deploy()) as RockPaperScissors;
  const contractAddress = await contract.getAddress();
  console.log(`✅ Contract deployed at: ${contractAddress}\n`);

  // Start game
  console.log("🎲 Starting new game...");
  const startTx = await contract.connect(alice).startGame(bob.address);
  await startTx.wait();
  console.log("✅ Game started!\n");

  // Alice submits Rock (encrypted)
  console.log("🔐 Alice submitting move (encrypted)...");
  const aliceMove = MOVES.ROCK;
  const aliceEncryptedMove = await fhevm
    .createEncryptedInput(contractAddress, alice.address)
    .add8(aliceMove)
    .encrypt();

  const aliceSubmitTx = await contract
    .connect(alice)
    .submitMove(aliceEncryptedMove.handles[0], aliceEncryptedMove.inputProof);
  await aliceSubmitTx.wait();
  console.log(`✅ Alice submitted: ${MOVE_NAMES[aliceMove]} (encrypted)\n`);

  // Bob submits Scissors (encrypted)
  console.log("🔐 Bob submitting move (encrypted)...");
  const bobMove = MOVES.SCISSORS;
  const bobEncryptedMove = await fhevm
    .createEncryptedInput(contractAddress, bob.address)
    .add8(bobMove)
    .encrypt();

  const bobSubmitTx = await contract
    .connect(bob)
    .submitMove(bobEncryptedMove.handles[0], bobEncryptedMove.inputProof);
  await bobSubmitTx.wait();
  console.log(`✅ Bob submitted: ${MOVE_NAMES[bobMove]} (encrypted)\n`);

  // Request reveal
  console.log("🔓 Requesting game result...");
  const revealTx = await contract.requestReveal();
  await revealTx.wait();
  console.log("✅ Reveal requested\n");

  // Wait for decryption callback
  console.log("⏳ Waiting for decryption callback...");

  if (fhevm.isMock) {
    // In mock mode, use awaitDecryptionOracle to simulate the callback
    await fhevm.awaitDecryptionOracle();
    console.log("✅ Decryption callback processed\n");

    // Get the decrypted result
    const result = Number(await contract.result());
    console.log("🎉 GAME RESULT:");
    console.log(`   Outcome: ${RESULT_NAMES[result]}`);
    console.log(`   Alice played: ${MOVE_NAMES[aliceMove]}`);
    console.log(`   Bob played: ${MOVE_NAMES[bobMove]}\n`);

    if (result === 1) {
      console.log("🏆 Winner: Alice");
    } else if (result === 2) {
      console.log("🏆 Winner: Bob");
    } else {
      console.log("🤝 It's a draw!");
    }
  } else {
    console.log("ℹ️  Running on real network (Sepolia)");
    console.log("   The Zama relayer will automatically:");
    console.log("   1. Detect the decryption request");
    console.log("   2. Coordinate with KMS to decrypt");
    console.log("   3. Call the contract callback with the result");
    console.log("   This can take 30 seconds to a few minutes.\n");
    console.log("   Check the result with:");
    console.log(`   - await contract.gameRevealed()`);
    console.log(`   - await contract.result()\n`);
  }

  console.log("================================");
  console.log("✅ Demo complete!\n");
}

// Export for use as a test
export { runDemo };

// Allow running as standalone script in test environment
if (require.main === module) {
  runDemo()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
