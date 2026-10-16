import { Router } from "express";
import { supabaseForRequest } from "../config/supabase.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth, requireRole("admin"));

router.get("/analytics", async (req, res) => {
  const db = supabaseForRequest(req.rawJwt!);
  const { data, error } = await db.from("v_admin_analytics").select("*").single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get("/doctor-load", async (req, res) => {
  const db = supabaseForRequest(req.rawJwt!);
  const { data, error } = await db.from("v_doctor_weekly_load").select("*").order("week_start", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get("/audit-logs", async (req, res) => {
  const db = supabaseForRequest(req.rawJwt!);
  const { data, error } = await db.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(200);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.patch("/users/:id/role", async (req, res) => {
  const { role } = req.body;
  if (!["patient", "doctor", "admin"].includes(role)) return res.status(400).json({ error: "Invalid role" });
  const db = supabaseForRequest(req.rawJwt!);
  const { data, error } = await db.from("users").update({ role }).eq("id", req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

export default router;
