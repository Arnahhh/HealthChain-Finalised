import { Router } from "express";
import { z } from "zod";
import { supabaseForRequest } from "../config/supabase.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { sha256Hex, anchorHashOnChain } from "../services/blockchain.service.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const db = supabaseForRequest(req.rawJwt!);
  const { data, error } = await db.from("prescriptions").select("*").order("issued_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

const medicationSchema = z.object({
  name: z.string(),
  dosage: z.string(),
  frequency: z.string(),
  duration_days: z.number().int().positive(),
});

router.post("/", requireRole("doctor", "admin"), async (req, res) => {
  const schema = z.object({
    appointment_id: z.string().uuid().optional(),
    patient_id: z.string().uuid(),
    medications: z.array(medicationSchema).min(1),
    notes: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const db = supabaseForRequest(req.rawJwt!);
  const { data: prescription, error } = await db
    .from("prescriptions")
    .insert({ ...parsed.data, doctor_id: req.auth!.app_user_id })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });

  // Anchor the prescription content hash on-chain too (Workflow 3 applies here as well).
  const contentHash = sha256Hex(Buffer.from(JSON.stringify(parsed.data.medications)));
  let blockchain;
  try {
    blockchain = await anchorHashOnChain({ recordId: prescription.id, fileHashHex: contentHash, recordType: "prescription" });
  } catch (e: any) {
    blockchain = { error: e.message };
  }

  res.status(201).json({ prescription, blockchain });
});

export default router;
