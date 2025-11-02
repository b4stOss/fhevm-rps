import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  // Deploy 2-player mode
  const deployedRPS = await deploy("RockPaperScissors", {
    from: deployer,
    log: true,
  });

  console.log(`RockPaperScissors (2-player) contract: `, deployedRPS.address);

  // Deploy solo mode
  const deployedSolo = await deploy("RockPaperScissorsSolo", {
    from: deployer,
    log: true,
  });

  console.log(`RockPaperScissorsSolo (solo) contract:  `, deployedSolo.address);
};
export default func;
func.id = "deploy_rockPaperScissors"; // id required to prevent reexecution
func.tags = ["RockPaperScissors"];
