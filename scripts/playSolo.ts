/**
 * Rock Paper Scissors Solo Mode - FHE Demo Script
 *
 * This script demonstrates a solo game (player vs AI) with encrypted moves.
 *
 * USAGE:
 *   npm run demo:solo
 *   (or: npx hardhat test test/RockPaperScissorsSolo.demo.ts)
 *
 * IMPORTANT: Do NOT run with `hardhat run` as the FHEVM plugin
 * requires initialization via the test runner.
 *
 * This script is imported by test/RockPaperScissorsSolo.demo.ts which provides
 * the necessary FHEVM environment setup.
 */

import { ethers, fhevm } from "hardhat";
import { RockPaperScissorsSolo } from "../types";

// Move encoding
const MOVES = {
  ROCK: 0,
  PAPER: 1,
  SCISSORS: 2,
} as const;

const MOVE_NAMES = ["Rock", "Paper", "Scissors"];
const RESULT_NAMES = ["Draw", "You win!", "Zama wins"];

async function runSoloDemo() {
  console.log("\n🎮 Rock Paper Scissors - Challenge Zama (FHE Demo)\n");
  console.log("====================================================\n");

  // Get player (Alice)
  const [alice] = await ethers.getSigners();

  console.log("👤 Player:");
  console.log(`   Alice: ${alice.address}\n`);

  // Deploy contract
  console.log("📝 Deploying RockPaperScissorsSolo contract...");
  const factory = await ethers.getContractFactory("RockPaperScissorsSolo");
  const contract = (await factory.deploy()) as RockPaperScissorsSolo;
  const contractAddress = await contract.getAddress();
  console.log(`✅ Contract deployed at: ${contractAddress}\n`);

  // Alice plays against Zama (all in one transaction)
  console.log("🎲 Starting game against Zama...");
  const aliceMove = MOVES.PAPER;
  console.log(`🔐 Alice submitting move: ${MOVE_NAMES[aliceMove]} (encrypted)\n`);

  const aliceEncryptedMove = await fhevm
    .createEncryptedInput(contractAddress, alice.address)
    .add8(aliceMove)
    .encrypt();

  const playTx = await contract.connect(alice).playAgainstZama(aliceEncryptedMove.handles[0], aliceEncryptedMove.inputProof);
  await playTx.wait();
  console.log("✅ Move submitted and Zama's move generated!\n");

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
    console.log(`   You played: ${MOVE_NAMES[aliceMove]}`);
    console.log(`   Zama's move: [CONFIDENTIAL - Never revealed!]\n`);

    if (result === 1) {
      console.log("🏆 Congratulations! You beat Zama!");
    } else if (result === 2) {
      console.log("💪 Zama won this round. Challenge again!");
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

  console.log("====================================================");
  console.log("✅ Demo complete!\n");
  console.log("💡 Key features:");
  console.log("   - Zama's move generated with FHE.randEuint8() (encrypted on-chain)");
  console.log("   - Zama's move NEVER revealed (stays confidential forever)");
  console.log("   - Winner calculated entirely on encrypted data");
  console.log("   - Only the final result is decrypted");
  console.log("\n🎯 About 'Zama':");
  console.log("   Zama personifies the encrypted randomness system.");
  console.log("   You're playing against Zama's FHE PRNG - the technology that");
  console.log("   makes confidential on-chain gaming possible!\n");
}

// Export for use as a test
export { runSoloDemo };

// Allow running as standalone script in test environment
if (require.main === module) {
  runSoloDemo()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
