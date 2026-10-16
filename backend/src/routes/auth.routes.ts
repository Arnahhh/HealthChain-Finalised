import { Router } from "express";
import { randomBytes } from "crypto";
import { verifyMessage } from "ethers";
import { z } from "zod";
import { supabaseAdmin } from "../config/supabase.js";
import { issueAppJwt } from "../middleware/auth.js";

const router = Router();

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;

/**
 * WORKFLOW 1 — BLOCKCHAIN AUTHENTICATION
 *
 * Step 1: POST /api/auth/nonce  { wallet_address }
 *         -> server generates a one-time nonce, stores it, returns a
 *            human-readable message for the wallet to sign.
 * Step 2: user signs that exact message in MetaMask (no gas, no tx).
 * Step 3: POST /api/auth/verify { wallet_address, signature }
 *         -> server recovers the signer address from the signature,
 *            checks it matches wallet_address AND the nonce is unexpired
 *            + unused, marks it consumed, looks up/creates the user row,
 *            and returns a signed JWT (also valid as a Supabase RLS token).
 */

router.post("/nonce", async (req, res) => {
  const schema = z.object({ wallet_address: z.string().regex(WALLET_RE) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid wallet_address" });

  const wallet = parsed.data.wallet_address.toLowerCase();
  const nonce = randomBytes(16).toString("hex");
  const expires_at = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 min

  const { error } = await supabaseAdmin.from("auth_nonces").insert({
    wallet_address: wallet,
    nonce,
    expires_at,
  });
  if (error) return res.status(500).json({ error: error.message });

  const message =
    `HealthChain wants you to sign in with your Ethereum account:\n${wallet}\n\n` +
    `This request will not trigger a blockchain transaction or cost gas.\n\n` +
    `Nonce: ${nonce}\nIssued At: ${new Date().toISOString()}`;

  res.json({ message, nonce });
});

router.post("/verify", async (req, res) => {
  const schema = z.object({
    wallet_address: z.string().regex(WALLET_RE),
    message: z.string(),
    signature: z.string(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const wallet = parsed.data.wallet_address.toLowerCase();

  // 1. Recover signer from signature and confirm it matches the claimed wallet.
  let recovered: string;
  try {
    recovered = verifyMessage(parsed.data.message, parsed.data.signature).toLowerCase();
  } catch {
    return res.status(401).json({ error: "Signature verification failed" });
  }
  if (recovered !== wallet) {
    return res.status(401).json({ error: "Signature does not match wallet address" });
  }

  // 2. Extract & validate the nonce embedded in the signed message.
  const nonceMatch = parsed.data.message.match(/Nonce:\s*([a-f0-9]+)/i);
  if (!nonceMatch) return res.status(400).json({ error: "Nonce missing from message" });
  const nonce = nonceMatch[1];

  const { data: nonceRow, error: nonceErr } = await supabaseAdmin
    .from("auth_nonces")
    .select("*")
    .eq("wallet_address", wallet)
    .eq("nonce", nonce)
    .is("consumed_at", null)
    .gte("expires_at", new Date().toISOString())
    .maybeSingle();

  if (nonceErr || !nonceRow) {
    return res.status(401).json({ error: "Nonce invalid, expired, or already used" });
  }

  await supabaseAdmin.from("auth_nonces").update({ consumed_at: new Date().toISOString() }).eq("id", nonceRow.id);

  // 3. Find or create the user (first-time wallets default to 'patient').
  let { data: user, error: userErr } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("wallet_address", wallet)
    .maybeSingle();

  if (userErr) return res.status(500).json({ error: userErr.message });

  if (!user) {
    const { data: created, error: createErr } = await supabaseAdmin
      .from("users")
      .insert({ wallet_address: wallet, role: "patient", full_name: `User ${wallet.slice(0, 8)}` })
      .select()
      .single();
    if (createErr) return res.status(500).json({ error: createErr.message });
    user = created;
  }

  if (!user.is_active) return res.status(403).json({ error: "Account disabled" });

  // 4. Issue the JWT (API session token + Supabase RLS token, see auth.ts).
  const token = issueAppJwt({ app_user_id: user.id, app_role: user.role, wallet_address: wallet });

  res.json({ token, user: { id: user.id, role: user.role, full_name: user.full_name, wallet_address: wallet } });
});

export default router;
