import { fhevm } from "hardhat";
import { runDemo } from "../scripts/playGame";

/**
 * Interactive demo test - Run the complete Rock Paper Scissors game
 *
 * Usage: npm test -- --grep "Demo"
 */
describe("Demo: Complete Rock Paper Scissors Game", function () {
  before(async function () {
    if (!fhevm.isMock) {
      console.warn("Demo requires FHEVM mock environment");
      this.skip();
    }
  });

  it("should run end-to-end game with Alice vs Bob", async function () {
    await runDemo();
  });
});
