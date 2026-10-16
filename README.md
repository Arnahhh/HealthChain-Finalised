# HealthChain

A relational healthcare management system secured by Ethereum-based identity
and blockchain auditability, with AI-powered (RAG) analysis of patient
medical reports.

## Architecture

```
USER → Ethereum Wallet → Sign Message → Backend Verify → Users Table → Role Check
                                                                  │
                                          ┌───────────────────────┼───────────────────────┐
                                          ▼                       ▼                       ▼
                                       PATIENT                 DOCTOR                  ADMIN
                                          └───────────────────────┼───────────────────────┘
                                                                  ▼
                                                        HEALTHCARE PLATFORM
                                          ┌───────────────────────┼───────────────────────┐
                                          ▼                       ▼                       ▼
                                   APPOINTMENTS           MEDICAL REPORTS          PRESCRIPTIONS
                                                                  │
                                                        ┌─────────┴─────────┐
                                                        ▼                   ▼
                                                   BLOCKCHAIN               AI
                                                   Hash / Audit        RAG / Analysis
                                                        └─────────┬─────────┘
                                                                  ▼
                                                     SUPABASE POSTGRESQL
                                                                  │
                                                                  ▼
                                                       ADMIN ANALYTICS
```

## The three core workflows

**1. Blockchain Authentication** — Wallet → Signature → Ethereum identity → Backend
verification → Role → Access. No passwords: the user signs a one-time nonce with
MetaMask, the backend recovers the signer address with `ethers.verifyMessage`, and
issues a JWT that also serves as a Supabase-compatible token for row-level security.
See `backend/src/routes/auth.routes.ts`.

**2. AI Medical Analysis (RAG)** — Medical report → text extraction → embedding →
pgvector retrieval of the same patient's past reports → grounded chat completion →
structured findings stored in `ai_analyses` → surfaced on the patient/doctor
dashboard. See `backend/src/services/ai.service.ts` and `ai/rag_demo.py`.

**3. Blockchain Medical Audit** — Medical report → sha256 hash → anchored on Sepolia
via the `MedicalAudit` smart contract → transaction record stored in
`blockchain_transactions` → anyone can later recompute the file hash and call
`verifyRecord()` to prove the document hasn't been altered. See
`backend/src/services/blockchain.service.ts` and `contracts/contracts/MedicalAudit.sol`.

All three sit on a normalized PostgreSQL schema (Supabase): `users → appointments →
medical_reports → ai_analyses → blockchain_transactions → prescriptions →
audit_logs → notifications`.

## Why the DBMS layer is the strongest part of this project

- **Normalization**: role-specific data (`doctor_profiles`, `patient_profiles`) is
  split from `users` (avoids nulls/repeating groups — 3NF), while `ai_analyses` and
  `blockchain_transactions` are separate append-only tables rather than columns
  bolted onto `medical_reports`.
- **Constraints**: CHECK constraints validate wallet address format, file hash
  format, blood group enum, non-negative fees, and patient≠doctor on appointments.
- **Triggers**: automatic `updated_at` maintenance, an audit-log trigger that fires
  on every INSERT/UPDATE/DELETE of sensitive tables, notification triggers on
  appointment/report/prescription changes, and a role-integrity trigger that
  rejects an appointment if `doctor_id` doesn't actually reference a doctor.
- **Views**: `v_patient_dashboard`, `v_doctor_dashboard`, `v_report_with_analysis`,
  `v_admin_analytics`, `v_doctor_weekly_load` — pre-joined, reusable read models
  instead of duplicating JOIN logic across the app.
- **Row-Level Security**: policies enforce "a patient sees only their own data,
  a doctor sees only their assigned patients, an admin sees everything" **at the
  database layer**, keyed off custom JWT claims (`app_user_id`, `app_role`) —
  not just `if` statements in application code.
- **pgvector**: `ai_analyses.embedding` + an ivfflat index + a
  `match_patient_analyses()` SQL function implement the RAG retrieval step
  directly in Postgres.

## Repo layout

```
db/            SQL migrations (schema, triggers, views, RLS, RAG function) + seed data
backend/       Express + TypeScript API (auth, appointments, reports, prescriptions, admin)
frontend/      Next.js app (wallet login + patient/doctor/admin dashboards)
contracts/     Solidity MedicalAudit contract + Hardhat deploy script + tests
ai/            Standalone Python RAG demo script (mirrors the backend AI service)
docs/          Additional diagrams / notes for the presentation
```

## Getting it running

### 1. Database (Supabase)
1. Create a free project at supabase.com.
2. In the SQL editor, run `db/migrations/001` through `005` in order, then optionally `db/seed/seed.sql`.
3. Create a storage bucket named `medical-reports`.
4. Copy your Project URL, `anon` key, and `service_role` key.

### 2. Backend
```bash
cd backend
cp .env.example .env   # fill in Supabase keys, JWT_SECRET, RPC URL, OpenAI key
npm install
npm run dev             # http://localhost:4000
```

### 3. Smart contract (Sepolia)
```bash
cd contracts
npm install
npx hardhat test
npx hardhat run scripts/deploy.ts --network sepolia
# copy the deployed address into backend/.env as AUDIT_CONTRACT_ADDRESS
```

### 4. Frontend
```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev              # http://localhost:3000
```

You'll need MetaMask installed and pointed at Sepolia (get free Sepolia ETH from a
faucet) for the wallet-connect and on-chain anchoring steps to work end to end.

## Pushing this to GitHub

This folder is already a git repo (see setup below). To publish it:

```bash
# create an empty repo on GitHub first (no README/license), then:
git remote add origin https://github.com/<your-username>/healthchain.git
git branch -M main
git push -u origin main
```

## Known simplifications (worth mentioning in your presentation)

- Report upload/analysis/anchoring run synchronously in one request for demo
  clarity; a production system would queue AI analysis and chain anchoring as
  background jobs so the upload endpoint returns instantly.
- OCR/text extraction from uploaded files isn't implemented — the demo expects
  `raw_text` to be supplied alongside the file (a real version would run OCR/PDF
  text extraction server-side before calling the AI service).
- The frontend patient upload form needs the logged-in patient's `id` wired in
  from the auth context (currently a placeholder hidden field) — a small, clearly
  scoped piece if you want to finish it yourself as a learning exercise.
