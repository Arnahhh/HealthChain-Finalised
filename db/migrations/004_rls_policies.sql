-- =====================================================================
-- HealthChain: Row-Level Security (Migration 004)
--
-- Design note: Supabase/PostgREST serves each HTTP request over a pooled
-- connection, so plain `set_config(..., is_local => true)` calls made as
-- separate RPC round-trips do NOT reliably persist for the query that
-- follows. The correct, standard Supabase pattern is instead to have the
-- backend mint a signed JWT (HS256, Supabase JWT secret) per authenticated
-- request carrying custom claims `app_user_id` and `app_role`, and read
-- those claims back out of `auth.jwt()` inside RLS policies below.
-- See backend/src/middleware/auth.ts (issueSupabaseJWT) for the minting
-- side of this contract.
-- =====================================================================

-- Helper functions -----------------------------------------------------
create or replace function fn_current_user_id() returns uuid as $$
    select nullif(auth.jwt() ->> 'app_user_id', '')::uuid;
$$ language sql stable;

create or replace function fn_current_user_role() returns text as $$
    select auth.jwt() ->> 'app_role';
$$ language sql stable;

-- ---------------------------------------------------------------------
alter table users enable row level security;
alter table doctor_profiles enable row level security;
alter table patient_profiles enable row level security;
alter table appointments enable row level security;
alter table medical_reports enable row level security;
alter table ai_analyses enable row level security;
alter table prescriptions enable row level security;
alter table blockchain_transactions enable row level security;
alter table notifications enable row level security;
alter table audit_logs enable row level security;

-- USERS: everyone can read their own row; admins read all; doctors read
-- basic info of their own patients.
create policy p_users_self_select on users
    for select using (
        id = fn_current_user_id()
        or fn_current_user_role() = 'admin'
        or (fn_current_user_role() = 'doctor' and exists (
              select 1 from appointments a
              where a.doctor_id = fn_current_user_id() and a.patient_id = users.id
           ))
    );

create policy p_users_self_update on users
    for update using (id = fn_current_user_id() or fn_current_user_role() = 'admin');

-- PROFILES: owner + admin only
create policy p_doctor_profiles on doctor_profiles
    for all using (user_id = fn_current_user_id() or fn_current_user_role() in ('admin'))
    with check (user_id = fn_current_user_id() or fn_current_user_role() = 'admin');

create policy p_patient_profiles on patient_profiles
    for all using (
        user_id = fn_current_user_id()
        or fn_current_user_role() = 'admin'
        or (fn_current_user_role() = 'doctor' and exists (
              select 1 from appointments a
              where a.doctor_id = fn_current_user_id() and a.patient_id = patient_profiles.user_id
           ))
    )
    with check (user_id = fn_current_user_id() or fn_current_user_role() = 'admin');

-- APPOINTMENTS: visible to the patient, the doctor, or admin
create policy p_appointments_select on appointments
    for select using (
        patient_id = fn_current_user_id()
        or doctor_id = fn_current_user_id()
        or fn_current_user_role() = 'admin'
    );

create policy p_appointments_insert on appointments
    for insert with check (
        patient_id = fn_current_user_id() or fn_current_user_role() = 'admin'
    );

create policy p_appointments_update on appointments
    for update using (
        doctor_id = fn_current_user_id()
        or patient_id = fn_current_user_id()
        or fn_current_user_role() = 'admin'
    );

-- MEDICAL REPORTS: patient owns it, assigned doctor can view/add, admin all
create policy p_reports_select on medical_reports
    for select using (
        patient_id = fn_current_user_id()
        or doctor_id = fn_current_user_id()
        or fn_current_user_role() = 'admin'
    );

create policy p_reports_insert on medical_reports
    for insert with check (
        doctor_id = fn_current_user_id()
        or patient_id = fn_current_user_id()
        or fn_current_user_role() = 'admin'
    );

-- AI ANALYSES: follow the parent report's visibility
create policy p_ai_analyses_select on ai_analyses
    for select using (
        exists (
            select 1 from medical_reports mr
            where mr.id = ai_analyses.report_id
              and (mr.patient_id = fn_current_user_id()
                   or mr.doctor_id = fn_current_user_id()
                   or fn_current_user_role() = 'admin')
        )
    );

-- PRESCRIPTIONS: patient + prescribing doctor + admin
create policy p_prescriptions_select on prescriptions
    for select using (
        patient_id = fn_current_user_id()
        or doctor_id = fn_current_user_id()
        or fn_current_user_role() = 'admin'
    );

create policy p_prescriptions_insert on prescriptions
    for insert with check (
        doctor_id = fn_current_user_id() or fn_current_user_role() = 'admin'
    );

-- BLOCKCHAIN TRANSACTIONS: follow parent report/prescription visibility, admin all
create policy p_btx_select on blockchain_transactions
    for select using (
        fn_current_user_role() = 'admin'
        or exists (select 1 from medical_reports mr where mr.id = blockchain_transactions.report_id
                    and (mr.patient_id = fn_current_user_id() or mr.doctor_id = fn_current_user_id()))
        or exists (select 1 from prescriptions pr where pr.id = blockchain_transactions.prescription_id
                    and (pr.patient_id = fn_current_user_id() or pr.doctor_id = fn_current_user_id()))
    );

-- NOTIFICATIONS: strictly owner-only
create policy p_notifications_owner on notifications
    for all using (user_id = fn_current_user_id())
    with check (user_id = fn_current_user_id());

-- AUDIT LOGS: admin only (read-only from the API's perspective)
create policy p_audit_admin_only on audit_logs
    for select using (fn_current_user_role() = 'admin');
