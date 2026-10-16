
import { ethers } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();
  const contractAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

  const contract = await ethers.getContractAt("MedicalAudit", contractAddress);

  const recordId = ethers.id("healthchain-demo-record-001");
  const documentHash = ethers.sha256(ethers.toUtf8Bytes("Sample medical report - demo only"));

  console.log("Signer:", signer.address);
  console.log("Contract:", contractAddress);
  console.log("Record ID:", recordId);
  console.log("Document SHA-256:", documentHash);

  const tx = await contract.anchorRecord(recordId, documentHash, "report");
  const receipt = await tx.wait();

  console.log("Anchor transaction:", receipt?.hash);
  console.log("Transaction status:", receipt?.status === 1 ? "SUCCESS" : "FAILED");

  const originalMatches = await contract.verifyRecord(recordId, documentHash);
  const tamperedHash = ethers.sha256(ethers.toUtf8Bytes("Modified medical report"));
  const tamperedMatches = await contract.verifyRecord(recordId, tamperedHash);

  console.log("Original document verified:", originalMatches);
  console.log("Modified document verified:", tamperedMatches);

  const record = await contract.getRecord(recordId);
  console.log("Submitted by:", record.submittedBy);
  console.log("Timestamp:", record.timestamp.toString());
  console.log("Record type:", record.recordType);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
