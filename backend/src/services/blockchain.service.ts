import { Contract, JsonRpcProvider, Wallet, id, keccak256, toUtf8Bytes } from "ethers";
import { createHash } from "crypto";
import { supabaseAdmin } from "../config/supabase.js";

const ABI = [
  "function anchorRecord(bytes32 recordId, bytes32 dataHash, string recordType) external",
  "function verifyRecord(bytes32 recordId, bytes32 dataHash) external view returns (bool)",
  "event RecordAnchored(bytes32 indexed recordId, bytes32 dataHash, string recordType, uint256 timestamp)",
];

function getContract() {
  const provider = new JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const signer = new Wallet(process.env.AUDIT_SIGNER_PRIVATE_KEY!, provider);
  return new Contract(process.env.AUDIT_CONTRACT_ADDRESS!, ABI, signer);
}

/** sha256 of a file buffer — this is what gets stored in medical_reports.file_hash */
export function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * WORKFLOW 3 — BLOCKCHAIN MEDICAL AUDIT
 *
 * Medical report uploaded -> sha256 hash computed -> hash anchored on
 * Sepolia via MedicalAudit.anchorRecord() -> tx hash + block number stored
 * in blockchain_transactions -> anyone (patient, doctor, auditor) can later
 * recompute the file hash and call verifyRecord() to prove the document
 * hasn't been altered since it was uploaded.
 */
export async function anchorHashOnChain(params: {
  recordId: string; // uuid of the report or prescription row
  fileHashHex: string; // sha256 hex digest (already computed)
  recordType: "report" | "prescription";
}) {
  const { recordId, fileHashHex, recordType } = params;

  const targetColumn = recordType === "report" ? "report_id" : "prescription_id";
  const { data: txRow, error: insertErr } = await supabaseAdmin
    .from("blockchain_transactions")
    .insert({
      [targetColumn]: recordId,
      chain: "sepolia",
      tx_hash: `pending-${recordId}-${Date.now()}`, // placeholder until confirmed, replaced below
      data_hash: fileHashHex,
      status: "pending",
    })
    .select()
    .single();
  if (insertErr) throw insertErr;

  try {
    const contract = getContract();
    const recordIdBytes32 = id(recordId); // keccak256 of the uuid string -> bytes32
    const dataHashBytes32 = `0x${fileHashHex}`;

    const tx = await contract.anchorRecord(recordIdBytes32, dataHashBytes32, recordType);
    const receipt = await tx.wait();

    await supabaseAdmin
      .from("blockchain_transactions")
      .update({
        tx_hash: receipt.hash,
        block_number: receipt.blockNumber,
        status: "confirmed",
        gas_used: receipt.gasUsed?.toString(),
        confirmed_at: new Date().toISOString(),
      })
      .eq("id", txRow.id);

    return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
  } catch (err) {
    await supabaseAdmin.from("blockchain_transactions").update({ status: "failed" }).eq("id", txRow.id);
    throw err;
  }
}

/** Recompute a file's hash and check it still matches what's on-chain. */
export async function verifyOnChain(recordId: string, fileHashHex: string): Promise<boolean> {
  const contract = getContract();
  const recordIdBytes32 = id(recordId);
  return contract.verifyRecord(recordIdBytes32, `0x${fileHashHex}`);
}
