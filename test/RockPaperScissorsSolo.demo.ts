import { fhevm } from "hardhat";
import { runSoloDemo } from "../scripts/playSolo";

/**
 * Interactive demo test - Run the solo Rock Paper Scissors game (Player vs Zama)
 *
 * Usage: npm test -- --grep "Demo: Solo"
 */
describe("Demo: Solo Rock Paper Scissors Game (Player vs Zama)", function () {
  before(async function () {
    if (!fhevm.isMock) {
      console.warn("Demo requires FHEVM mock environment");
      this.skip();
    }
  });

  it("should run end-to-end solo game with Alice vs Zama", async function () {
    await runSoloDemo();
  });
});
