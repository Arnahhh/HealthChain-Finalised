import { Router } from "express";
import { z } from "zod";
import { supabaseForRequest } from "../config/supabase.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const db = supabaseForRequest(req.rawJwt!);
  const view = req.auth!.app_role === "doctor" ? "v_doctor_dashboard" : "v_patient_dashboard";
  const { data, error } = await db.from(view).select("*").order("scheduled_at", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post("/", async (req, res) => {
  const schema = z.object({
    doctor_id: z.string().uuid(),
    scheduled_at: z.string().datetime(),
    reason: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const db = supabaseForRequest(req.rawJwt!);
  const { data, error } = await db
    .from("appointments")
    .insert({ ...parsed.data, patient_id: req.auth!.app_user_id, status: "requested" })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

router.patch("/:id/status", async (req, res) => {
  const schema = z.object({ status: z.enum(["confirmed", "completed", "cancelled", "no_show"]) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const db = supabaseForRequest(req.rawJwt!);
  const { data, error } = await db.from("appointments").update({ status: parsed.data.status }).eq("id", req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

export default router;
