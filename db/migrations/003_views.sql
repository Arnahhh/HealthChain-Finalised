-- =====================================================================
-- HealthChain: Views (Migration 003)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Patient dashboard: everything relevant to one patient, pre-joined
-- ---------------------------------------------------------------------
create or replace view v_patient_dashboard as
select
    u.id                as patient_id,
    u.full_name,
    a.id                as appointment_id,
    a.scheduled_at,
    a.status            as appointment_status,
    d.full_name          as doctor_name,
    dp.specialization
from users u
join appointments a on a.patient_id = u.id
join users d on d.id = a.doctor_id
left join doctor_profiles dp on dp.user_id = d.id
where u.role = 'patient';

-- ---------------------------------------------------------------------
-- Doctor dashboard: upcoming appointments + patient report counts
-- ---------------------------------------------------------------------
create or replace view v_doctor_dashboard as
select
    doc.id                  as doctor_id,
    doc.full_name           as doctor_name,
    a.id                    as appointment_id,
    a.scheduled_at,
    a.status,
    p.id                    as patient_id,
    p.full_name             as patient_name,
    (select count(*) from medical_reports mr where mr.patient_id = p.id) as patient_report_count
from users doc
join appointments a on a.doctor_id = doc.id
join users p on p.id = a.patient_id
where doc.role = 'doctor';

-- ---------------------------------------------------------------------
-- Report + latest AI analysis, joined for the report detail screen
-- ---------------------------------------------------------------------
create or replace view v_report_with_analysis as
select
    mr.id               as report_id,
    mr.patient_id,
    mr.doctor_id,
    mr.title,
    mr.report_type,
    mr.file_hash,
    mr.created_at       as report_created_at,
    ai.summary,
    ai.findings,
    ai.confidence,
    ai.model_used,
    btx.tx_hash,
    btx.status           as blockchain_status,
    btx.block_number
from medical_reports mr
left join lateral (
    select * from ai_analyses a
    where a.report_id = mr.id
    order by a.created_at desc
    limit 1
) ai on true
left join blockchain_transactions btx on btx.report_id = mr.id;

-- ---------------------------------------------------------------------
-- Admin analytics: platform-wide aggregates
-- ---------------------------------------------------------------------
create or replace view v_admin_analytics as
select
    (select count(*) from users where role = 'patient')                          as total_patients,
    (select count(*) from users where role = 'doctor')                           as total_doctors,
    (select count(*) from appointments)                                          as total_appointments,
    (select count(*) from appointments where status = 'completed')               as completed_appointments,
    (select count(*) from medical_reports)                                       as total_reports,
    (select count(*) from ai_analyses)                                           as total_ai_analyses,
    (select count(*) from prescriptions)                                         as total_prescriptions,
    (select count(*) from blockchain_transactions where status = 'confirmed')    as confirmed_chain_txs,
    (select count(*) from blockchain_transactions where status = 'pending')      as pending_chain_txs,
    (select round(avg(extract(epoch from confirmed_at - created_at))::numeric, 1)
       from blockchain_transactions where status = 'confirmed')                  as avg_confirmation_seconds;

-- ---------------------------------------------------------------------
-- Appointment load per doctor per week (useful for admin scheduling charts)
-- ---------------------------------------------------------------------
create or replace view v_doctor_weekly_load as
select
    doctor_id,
    date_trunc('week', scheduled_at) as week_start,
    count(*)                          as appointment_count,
    count(*) filter (where status = 'completed') as completed_count,
    count(*) filter (where status = 'cancelled') as cancelled_count
from appointments
group by doctor_id, date_trunc('week', scheduled_at);
