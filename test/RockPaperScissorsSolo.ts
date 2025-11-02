import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { RockPaperScissorsSolo, RockPaperScissorsSolo__factory } from "../types";
import { expect } from "chai";
import * as hre from "hardhat";

type Signers = {
  alice: HardhatEthersSigner;
};

// Move encoding: 0=Rock, 1=Paper, 2=Scissors
const ROCK = 0;
const PAPER = 1;
const SCISSORS = 2;

// Result encoding: 0=Draw, 1=Player wins, 2=Zama wins
const DRAW = 0;
const PLAYER_WINS = 1;
const ZAMA_WINS = 2;

async function deployFixture() {
  const factory = (await ethers.getContractFactory("RockPaperScissorsSolo")) as RockPaperScissorsSolo__factory;
  const contract = (await factory.deploy()) as RockPaperScissorsSolo;
  const contractAddress = await contract.getAddress();

  return { contract, contractAddress };
}

describe("RockPaperScissorsSolo", function () {
  let signers: Signers;
  let contract: RockPaperScissorsSolo;
  let contractAddress: string;

  before(async function () {
    // Check whether the tests are running against an FHEVM mock environment
    if (!hre.fhevm.isMock) {
      console.warn(`This test suite requires FHEVM mock environment`);
      this.skip();
    }

    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { alice: ethSigners[1] };
  });

  beforeEach(async function () {
    ({ contract, contractAddress } = await deployFixture());
  });

  it("should play against Zama and reveal result", async function () {
    // Alice plays Rock against Zama
    const aliceMove = await hre.fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .add8(ROCK)
      .encrypt();

    // Play the game (all in one transaction)
    const tx = await contract.connect(signers.alice).playAgainstZama(aliceMove.handles[0], aliceMove.inputProof);
    await tx.wait();

    // Wait for decryption oracle to process the request and trigger callback
    await hre.fhevm.awaitDecryptionOracle();

    // Verify the game is revealed and result is valid
    expect(await contract.gameRevealed()).to.equal(true);
    expect(await contract.player()).to.equal(signers.alice.address);

    // Result should be one of: Draw, Player wins, or Zama wins
    const result = Number(await contract.result());
    expect(result).to.be.oneOf([DRAW, PLAYER_WINS, ZAMA_WINS]);
  });

  it("should allow reset and replay", async function () {
    // ===== GAME 1 =====
    const aliceMove1 = await hre.fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .add8(PAPER)
      .encrypt();

    await contract.connect(signers.alice).playAgainstZama(aliceMove1.handles[0], aliceMove1.inputProof);
    await hre.fhevm.awaitDecryptionOracle();

    // Verify game 1 completed
    expect(await contract.gameRevealed()).to.equal(true);
    await contract.result();

    // Reset for game 2
    await contract.connect(signers.alice).resetGame();

    // Verify state is reset
    expect(await contract.player()).to.equal(ethers.ZeroAddress);
    expect(await contract.gameRevealed()).to.equal(false);
    expect(await contract.result()).to.equal(0);

    // ===== GAME 2 =====
    const aliceMove2 = await hre.fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .add8(SCISSORS)
      .encrypt();

    await contract.connect(signers.alice).playAgainstZama(aliceMove2.handles[0], aliceMove2.inputProof);
    await hre.fhevm.awaitDecryptionOracle();

    // Verify game 2 completed
    expect(await contract.gameRevealed()).to.equal(true);
    const result2 = Number(await contract.result());
    expect(result2).to.be.oneOf([DRAW, PLAYER_WINS, ZAMA_WINS]);
  });

  it("should prevent playing while game is in progress", async function () {
    // Start game 1
    const aliceMove1 = await hre.fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .add8(ROCK)
      .encrypt();

    await contract.connect(signers.alice).playAgainstZama(aliceMove1.handles[0], aliceMove1.inputProof);
    await hre.fhevm.awaitDecryptionOracle();

    // Try to start game 2 without resetting - should fail
    const aliceMove2 = await hre.fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .add8(PAPER)
      .encrypt();

    await expect(
      contract.connect(signers.alice).playAgainstZama(aliceMove2.handles[0], aliceMove2.inputProof)
    ).to.be.revertedWith("Game already in progress");
  });

  it("should prevent reset before game is revealed", async function () {
    // Start a game but don't wait for reveal
    const aliceMove = await hre.fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .add8(ROCK)
      .encrypt();

    await contract.connect(signers.alice).playAgainstZama(aliceMove.handles[0], aliceMove.inputProof);
    // Don't call awaitDecryptionOracle() - game is not revealed yet

    // Try to reset before reveal - should fail
    await expect(contract.connect(signers.alice).resetGame()).to.be.revertedWith(
      "Current game not revealed yet"
    );
  });
});
