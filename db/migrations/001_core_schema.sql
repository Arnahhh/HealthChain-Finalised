-- =====================================================================
-- HealthChain: Core Schema (Migration 001)
-- Blockchain-authenticated, AI-augmented healthcare platform
-- Target: Supabase Postgres (>=15), pgcrypto + pgvector extensions
-- =====================================================================

create extension if not exists pgcrypto;   -- for gen_random_uuid()
create extension if not exists vector;     -- for embeddings (pgvector)
create extension if not exists citext;     -- case-insensitive text (wallet addresses, email)

-- ---------------------------------------------------------------------
-- ENUM TYPES
-- ---------------------------------------------------------------------
create type user_role as enum ('patient', 'doctor', 'admin');
create type appointment_status as enum ('requested', 'confirmed', 'completed', 'cancelled', 'no_show');
create type report_type as enum ('lab_result', 'imaging', 'discharge_summary', 'consultation_note', 'other');
create type tx_status as enum ('pending', 'confirmed', 'failed');
create type notification_type as enum ('appointment', 'report', 'prescription', 'system');

-- ---------------------------------------------------------------------
-- USERS  (identity anchored to an Ethereum wallet address)
-- ---------------------------------------------------------------------
create table users (
    id              uuid primary key default gen_random_uuid(),
    wallet_address  citext not null unique,          -- lowercase, unique EOA address
    role            user_role not null default 'patient',
    full_name       text not null,
    email           citext unique,
    phone           text,
    is_active       boolean not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    constraint chk_wallet_format check (wallet_address ~* '^0x[a-f0-9]{40}$')
);

create index idx_users_role on users(role);
create index idx_users_wallet on users(wallet_address);

-- ---------------------------------------------------------------------
-- AUTH NONCES  (SIWE-style: one-time nonce signed by the wallet)
-- ---------------------------------------------------------------------
create table auth_nonces (
    id              uuid primary key default gen_random_uuid(),
    wallet_address  citext not null,
    nonce           text not null unique,
    expires_at      timestamptz not null,
    consumed_at     timestamptz,
    created_at      timestamptz not null default now()
);

create index idx_auth_nonces_wallet on auth_nonces(wallet_address);
create index idx_auth_nonces_expiry on auth_nonces(expires_at) where consumed_at is null;

-- ---------------------------------------------------------------------
-- ROLE-SPECIFIC PROFILES  (1:1 extension tables -> keeps USERS lean/3NF)
-- ---------------------------------------------------------------------
create table doctor_profiles (
    user_id             uuid primary key references users(id) on delete cascade,
    specialization      text not null,
    license_number      text not null unique,
    years_experience    smallint check (years_experience >= 0),
    consultation_fee    numeric(10,2) check (consultation_fee >= 0),
    bio                 text
);

create table patient_profiles (
    user_id         uuid primary key references users(id) on delete cascade,
    date_of_birth   date,
    blood_group     text check (blood_group in ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
    allergies       text,
    emergency_contact text
);

-- ---------------------------------------------------------------------
-- APPOINTMENTS
-- ---------------------------------------------------------------------
create table appointments (
    id              uuid primary key default gen_random_uuid(),
    patient_id      uuid not null references users(id) on delete cascade,
    doctor_id       uuid not null references users(id) on delete cascade,
    scheduled_at    timestamptz not null,
    status          appointment_status not null default 'requested',
    reason          text,
    notes           text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    constraint chk_appt_roles check (patient_id <> doctor_id)
);

create index idx_appt_patient on appointments(patient_id);
create index idx_appt_doctor on appointments(doctor_id);
create index idx_appt_status on appointments(status);
create index idx_appt_scheduled on appointments(scheduled_at);

-- ---------------------------------------------------------------------
-- MEDICAL REPORTS
-- ---------------------------------------------------------------------
create table medical_reports (
    id              uuid primary key default gen_random_uuid(),
    patient_id      uuid not null references users(id) on delete cascade,
    doctor_id       uuid references users(id) on delete set null,
    appointment_id  uuid references appointments(id) on delete set null,
    report_type     report_type not null default 'other',
    title           text not null,
    file_url        text not null,          -- Supabase Storage object path
    file_hash       text not null,          -- sha256 of file bytes (anchored on-chain)
    raw_text        text,                   -- extracted text used for RAG
    created_at      timestamptz not null default now(),

    constraint chk_file_hash_format check (file_hash ~* '^[a-f0-9]{64}$')
);

create index idx_reports_patient on medical_reports(patient_id);
create index idx_reports_doctor on medical_reports(doctor_id);
create index idx_reports_type on medical_reports(report_type);

-- ---------------------------------------------------------------------
-- AI ANALYSES  (RAG output linked 1:1 -> N with a report; embeddings for retrieval)
-- ---------------------------------------------------------------------
create table ai_analyses (
    id              uuid primary key default gen_random_uuid(),
    report_id       uuid not null references medical_reports(id) on delete cascade,
    summary         text not null,
    findings        jsonb not null default '{}'::jsonb,   -- structured: {flags:[...], severity:"..."}
    embedding       vector(1536),                          -- text-embedding-3-small dimension
    model_used      text not null,
    confidence      numeric(4,3) check (confidence between 0 and 1),
    created_at      timestamptz not null default now()
);

create index idx_ai_report on ai_analyses(report_id);
create index idx_ai_embedding on ai_analyses using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ---------------------------------------------------------------------
-- PRESCRIPTIONS
-- ---------------------------------------------------------------------
create table prescriptions (
    id              uuid primary key default gen_random_uuid(),
    appointment_id  uuid references appointments(id) on delete set null,
    patient_id      uuid not null references users(id) on delete cascade,
    doctor_id       uuid not null references users(id) on delete cascade,
    medications     jsonb not null,   -- [{name, dosage, frequency, duration_days}]
    notes           text,
    issued_at       timestamptz not null default now(),

    constraint chk_presc_roles check (patient_id <> doctor_id)
);

create index idx_presc_patient on prescriptions(patient_id);
create index idx_presc_doctor on prescriptions(doctor_id);

-- ---------------------------------------------------------------------
-- BLOCKCHAIN TRANSACTIONS  (audit anchoring for reports & prescriptions)
-- ---------------------------------------------------------------------
create table blockchain_transactions (
    id              uuid primary key default gen_random_uuid(),
    report_id       uuid references medical_reports(id) on delete set null,
    prescription_id uuid references prescriptions(id) on delete set null,
    chain           text not null default 'sepolia',
    tx_hash         text not null unique,
    block_number    bigint,
    data_hash       text not null,          -- the sha256 that was anchored
    status          tx_status not null default 'pending',
    gas_used        numeric(20,0),
    created_at      timestamptz not null default now(),
    confirmed_at    timestamptz,

    constraint chk_one_target check (
        (report_id is not null and prescription_id is null) or
        (report_id is null and prescription_id is not null)
    )
);

create index idx_btx_report on blockchain_transactions(report_id);
create index idx_btx_prescription on blockchain_transactions(prescription_id);
create index idx_btx_status on blockchain_transactions(status);

-- ---------------------------------------------------------------------
-- AUDIT LOGS  (generic append-only trail, populated by triggers below)
-- ---------------------------------------------------------------------
create table audit_logs (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid references users(id) on delete set null,
    action          text not null,           -- e.g. 'INSERT', 'UPDATE', 'ROLE_CHANGE'
    entity_type     text not null,           -- e.g. 'medical_reports'
    entity_id       uuid not null,
    metadata        jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now()
);

create index idx_audit_entity on audit_logs(entity_type, entity_id);
create index idx_audit_user on audit_logs(user_id);
create index idx_audit_created on audit_logs(created_at);

-- ---------------------------------------------------------------------
-- NOTIFICATIONS
-- ---------------------------------------------------------------------
create table notifications (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references users(id) on delete cascade,
    type            notification_type not null,
    message         text not null,
    is_read         boolean not null default false,
    created_at      timestamptz not null default now()
);

create index idx_notif_user on notifications(user_id, is_read);
