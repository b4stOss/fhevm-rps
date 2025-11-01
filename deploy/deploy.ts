import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedRPS = await deploy("RockPaperScissors", {
    from: deployer,
    log: true,
  });

  console.log(`RockPaperScissors contract: `, deployedRPS.address);
};
export default func;
func.id = "deploy_rockPaperScissors"; // id required to prevent reexecution
func.tags = ["RockPaperScissors"];
