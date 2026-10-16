import { expect } from "chai";
import { ethers } from "hardhat";

describe("MedicalAudit", () => {
  it("anchors a record and verifies it", async () => {
    const [owner] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("MedicalAudit");
    const contract = await Factory.deploy();
    await contract.waitForDeployment();

    const recordId = ethers.id("report-uuid-66666666-6666-6666-6666-666666666666");
    const dataHash = ethers.id("file-contents-placeholder");

    await expect(contract.anchorRecord(recordId, dataHash, "report"))
      .to.emit(contract, "RecordAnchored")
      .withArgs(recordId, dataHash, "report", (await ethers.provider.getBlock("latest"))!.timestamp + 1);

    expect(await contract.verifyRecord(recordId, dataHash)).to.equal(true);
    expect(await contract.verifyRecord(recordId, ethers.id("tampered"))).to.equal(false);
  });

  it("rejects re-anchoring the same recordId", async () => {
    const Factory = await ethers.getContractFactory("MedicalAudit");
    const contract = await Factory.deploy();
    const recordId = ethers.id("dup-record");
    const dataHash = ethers.id("hash-1");
    await contract.anchorRecord(recordId, dataHash, "report");
    await expect(contract.anchorRecord(recordId, dataHash, "report")).to.be.revertedWith(
      "Record already anchored"
    );
  });
});
