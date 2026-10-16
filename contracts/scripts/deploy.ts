import { ethers } from "hardhat";

async function main() {
  const MedicalAudit = await ethers.getContractFactory("MedicalAudit");
  const contract = await MedicalAudit.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`MedicalAudit deployed to: ${address}`);
  console.log(`Add this to backend/.env as AUDIT_CONTRACT_ADDRESS=${address}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
