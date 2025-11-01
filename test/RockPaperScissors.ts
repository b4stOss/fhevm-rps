import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { RockPaperScissors, RockPaperScissors__factory } from "../types";
import { expect } from "chai";
import * as hre from "hardhat";

type Signers = {
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

// Move encoding: 0=Rock, 1=Paper, 2=Scissors
const ROCK = 0;
const PAPER = 1;
const SCISSORS = 2;

// Result encoding: 0=Draw, 1=Player1 wins, 2=Player2 wins
const DRAW = 0;
const PLAYER1_WINS = 1;
const PLAYER2_WINS = 2;

async function deployFixture() {
  const factory = (await ethers.getContractFactory("RockPaperScissors")) as RockPaperScissors__factory;
  const contract = (await factory.deploy()) as RockPaperScissors;
  const contractAddress = await contract.getAddress();

  return { contract, contractAddress };
}

describe("RockPaperScissors", function () {
  let signers: Signers;
  let contract: RockPaperScissors;
  let contractAddress: string;

  before(async function () {
    // Check whether the tests are running against an FHEVM mock environment
    if (!hre.fhevm.isMock) {
      console.warn(`This test suite requires FHEVM mock environment`);
      this.skip();
    }

    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { alice: ethSigners[1], bob: ethSigners[2] };
  });

  beforeEach(async function () {
    ({ contract, contractAddress } = await deployFixture());
  });

  it("should complete a full game: Alice (Rock) beats Bob (Scissors)", async function () {
    // Start game
    await contract.connect(signers.alice).startGame(signers.bob.address);

    // Alice submits Rock (encrypted)
    const aliceMove = await hre.fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .add8(ROCK)
      .encrypt();
    await contract.connect(signers.alice).submitMove(aliceMove.handles[0], aliceMove.inputProof);

    // Bob submits Scissors (encrypted)
    const bobMove = await hre.fhevm
      .createEncryptedInput(contractAddress, signers.bob.address)
      .add8(SCISSORS)
      .encrypt();
    await contract.connect(signers.bob).submitMove(bobMove.handles[0], bobMove.inputProof);

    // Request reveal
    const tx = await contract.requestReveal();
    await tx.wait();

    // Wait for decryption oracle to process the request and trigger callback
    await hre.fhevm.awaitDecryptionOracle();

    // Verify the game is revealed and result is correct
    expect(await contract.gameRevealed()).to.equal(true);
    expect(await contract.result()).to.equal(PLAYER1_WINS);
  });

  it("should correctly handle a draw (Rock vs Rock)", async function () {
    // Start game
    await contract.connect(signers.alice).startGame(signers.bob.address);

    // Both players submit Rock
    const aliceMove = await hre.fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .add8(ROCK)
      .encrypt();
    await contract.connect(signers.alice).submitMove(aliceMove.handles[0], aliceMove.inputProof);

    const bobMove = await hre.fhevm
      .createEncryptedInput(contractAddress, signers.bob.address)
      .add8(ROCK)
      .encrypt();
    await contract.connect(signers.bob).submitMove(bobMove.handles[0], bobMove.inputProof);

    // Request reveal and wait for callback
    const tx = await contract.requestReveal();
    await tx.wait();
    await hre.fhevm.awaitDecryptionOracle();

    // Verify draw result
    expect(await contract.gameRevealed()).to.equal(true);
    expect(await contract.result()).to.equal(DRAW);
  });

  it("should prevent player from submitting twice (idempotency)", async function () {
    // Start game
    await contract.connect(signers.alice).startGame(signers.bob.address);

    // Alice submits first move
    const aliceMove1 = await hre.fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .add8(ROCK)
      .encrypt();
    await contract.connect(signers.alice).submitMove(aliceMove1.handles[0], aliceMove1.inputProof);

    // Alice tries to submit again - should fail
    const aliceMove2 = await hre.fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .add8(PAPER)
      .encrypt();

    await expect(
      contract.connect(signers.alice).submitMove(aliceMove2.handles[0], aliceMove2.inputProof)
    ).to.be.revertedWith("Player1 already submitted");
  });

  it("should prevent revealing before both players have submitted", async function () {
    // Start game
    await contract.connect(signers.alice).startGame(signers.bob.address);

    // Only Alice submits
    const aliceMove = await hre.fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .add8(ROCK)
      .encrypt();
    await contract.connect(signers.alice).submitMove(aliceMove.handles[0], aliceMove.inputProof);

    // Try to reveal without Bob's move - should fail
    await expect(contract.requestReveal()).to.be.revertedWith("Both players must submit moves first");
  });

  it("should handle multiple games with resetGame()", async function () {
    // ===== GAME 1: Alice (Rock) vs Bob (Scissors) =====
    await contract.connect(signers.alice).startGame(signers.bob.address);

    const aliceMove1 = await hre.fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .add8(ROCK)
      .encrypt();
    await contract.connect(signers.alice).submitMove(aliceMove1.handles[0], aliceMove1.inputProof);

    const bobMove1 = await hre.fhevm
      .createEncryptedInput(contractAddress, signers.bob.address)
      .add8(SCISSORS)
      .encrypt();
    await contract.connect(signers.bob).submitMove(bobMove1.handles[0], bobMove1.inputProof);

    // Reveal game 1
    const tx1 = await contract.requestReveal();
    await tx1.wait();
    await hre.fhevm.awaitDecryptionOracle();

    // Verify game 1 result: Alice wins (Rock beats Scissors)
    expect(await contract.gameRevealed()).to.equal(true);
    expect(await contract.result()).to.equal(PLAYER1_WINS);

    // Reset for game 2
    await contract.connect(signers.alice).resetGame();

    // Verify state is reset
    expect(await contract.player1()).to.equal(ethers.ZeroAddress);
    expect(await contract.player2()).to.equal(ethers.ZeroAddress);
    expect(await contract.player1Submitted()).to.equal(false);
    expect(await contract.player2Submitted()).to.equal(false);
    expect(await contract.gameRevealed()).to.equal(false);
    expect(await contract.result()).to.equal(0);

    // ===== GAME 2: Alice (Rock) vs Bob (Paper) =====
    await contract.connect(signers.alice).startGame(signers.bob.address);

    const aliceMove2 = await hre.fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .add8(ROCK)
      .encrypt();
    await contract.connect(signers.alice).submitMove(aliceMove2.handles[0], aliceMove2.inputProof);

    const bobMove2 = await hre.fhevm
      .createEncryptedInput(contractAddress, signers.bob.address)
      .add8(PAPER)
      .encrypt();
    await contract.connect(signers.bob).submitMove(bobMove2.handles[0], bobMove2.inputProof);

    // Reveal game 2
    const tx2 = await contract.requestReveal();
    await tx2.wait();
    await hre.fhevm.awaitDecryptionOracle();

    // Verify game 2 result: Alice wins again (Paper beats Rock)
    expect(await contract.gameRevealed()).to.equal(true);
    expect(await contract.result()).to.equal(PLAYER2_WINS);
  });

  it("should prevent non-players from resetting", async function () {
    // Start and complete a game
    await contract.connect(signers.alice).startGame(signers.bob.address);

    const aliceMove = await hre.fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .add8(ROCK)
      .encrypt();
    await contract.connect(signers.alice).submitMove(aliceMove.handles[0], aliceMove.inputProof);

    const bobMove = await hre.fhevm
      .createEncryptedInput(contractAddress, signers.bob.address)
      .add8(SCISSORS)
      .encrypt();
    await contract.connect(signers.bob).submitMove(bobMove.handles[0], bobMove.inputProof);

    const tx = await contract.requestReveal();
    await tx.wait();
    await hre.fhevm.awaitDecryptionOracle();

    // Get a third signer (not a player)
    const [, , , charlie] = await ethers.getSigners();

    // Charlie tries to reset - should fail
    await expect(contract.connect(charlie).resetGame()).to.be.revertedWith("Only players can reset");
  });

  it("should prevent reset before game is revealed", async function () {
    // Start game
    await contract.connect(signers.alice).startGame(signers.bob.address);

    const aliceMove = await hre.fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .add8(ROCK)
      .encrypt();
    await contract.connect(signers.alice).submitMove(aliceMove.handles[0], aliceMove.inputProof);

    // Try to reset before reveal - should fail
    await expect(contract.connect(signers.alice).resetGame()).to.be.revertedWith(
      "Current game not revealed yet"
    );
  });

  it("should sanitize invalid moves (> 2) to Rock (0)", async function () {
    // Start game
    await contract.connect(signers.alice).startGame(signers.bob.address);

    // Alice submits an INVALID move (7) - should be clamped to Rock (0)
    const aliceInvalidMove = await hre.fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .add8(7) // Invalid move
      .encrypt();
    await contract.connect(signers.alice).submitMove(aliceInvalidMove.handles[0], aliceInvalidMove.inputProof);

    // Bob submits Scissors (2)
    const bobMove = await hre.fhevm
      .createEncryptedInput(contractAddress, signers.bob.address)
      .add8(SCISSORS)
      .encrypt();
    await contract.connect(signers.bob).submitMove(bobMove.handles[0], bobMove.inputProof);

    // Request reveal
    const tx = await contract.requestReveal();
    await tx.wait();
    await hre.fhevm.awaitDecryptionOracle();

    // Verify result: Alice's invalid move (7) was sanitized to Rock (0)
    // Rock (0) beats Scissors (2), so Player 1 (Alice) should win
    expect(await contract.gameRevealed()).to.equal(true);
    expect(await contract.result()).to.equal(PLAYER1_WINS); // Rock beats Scissors
  });
});
