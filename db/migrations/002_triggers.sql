-- =====================================================================
-- HealthChain: Triggers (Migration 002)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Generic updated_at maintenance
-- ---------------------------------------------------------------------
create or replace function fn_set_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger trg_users_updated_at
    before update on users
    for each row execute function fn_set_updated_at();

create trigger trg_appointments_updated_at
    before update on appointments
    for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------
-- Audit logging: fires on every INSERT/UPDATE/DELETE to sensitive tables
-- Captures who (via app.current_user_id session var, set by backend),
-- what changed, and a JSON diff.
-- ---------------------------------------------------------------------
create or replace function fn_audit_trigger()
returns trigger as $$
declare
    v_user_id uuid;
    v_entity_id uuid;
begin
    begin
        v_user_id := nullif(current_setting('app.current_user_id', true), '')::uuid;
    exception when others then
        v_user_id := null;
    end;

    v_entity_id := coalesce((case when TG_OP = 'DELETE' then old.id else new.id end), gen_random_uuid());

    insert into audit_logs (user_id, action, entity_type, entity_id, metadata)
    values (
        v_user_id,
        TG_OP,
        TG_TABLE_NAME,
        v_entity_id,
        jsonb_build_object(
            'old', case when TG_OP in ('UPDATE','DELETE') then to_jsonb(old) else null end,
            'new', case when TG_OP in ('UPDATE','INSERT') then to_jsonb(new) else null end
        )
    );

    return coalesce(new, old);
end;
$$ language plpgsql;

create trigger trg_audit_medical_reports
    after insert or update or delete on medical_reports
    for each row execute function fn_audit_trigger();

create trigger trg_audit_prescriptions
    after insert or update or delete on prescriptions
    for each row execute function fn_audit_trigger();

create trigger trg_audit_appointments
    after insert or update or delete on appointments
    for each row execute function fn_audit_trigger();

create trigger trg_audit_users_role
    after update of role on users
    for each row execute function fn_audit_trigger();

-- ---------------------------------------------------------------------
-- Auto-notifications
-- ---------------------------------------------------------------------
create or replace function fn_notify_appointment_change()
returns trigger as $$
begin
    if TG_OP = 'INSERT' then
        insert into notifications (user_id, type, message)
        values (new.doctor_id, 'appointment',
                format('New appointment requested for %s', to_char(new.scheduled_at, 'YYYY-MM-DD HH24:MI')));
    elsif TG_OP = 'UPDATE' and old.status <> new.status then
        insert into notifications (user_id, type, message)
        values (new.patient_id, 'appointment',
                format('Your appointment status changed to %s', new.status));
    end if;
    return new;
end;
$$ language plpgsql;

create trigger trg_notify_appointment
    after insert or update on appointments
    for each row execute function fn_notify_appointment_change();

create or replace function fn_notify_new_report()
returns trigger as $$
begin
    insert into notifications (user_id, type, message)
    values (new.patient_id, 'report', format('A new medical report "%s" has been added', new.title));
    return new;
end;
$$ language plpgsql;

create trigger trg_notify_report
    after insert on medical_reports
    for each row execute function fn_notify_new_report();

create or replace function fn_notify_new_prescription()
returns trigger as $$
begin
    insert into notifications (user_id, type, message)
    values (new.patient_id, 'prescription', 'A new prescription has been issued for you');
    return new;
end;
$$ language plpgsql;

create trigger trg_notify_prescription
    after insert on prescriptions
    for each row execute function fn_notify_new_prescription();

-- ---------------------------------------------------------------------
-- Guard: only doctors/admins can be assigned as appointments.doctor_id
-- ---------------------------------------------------------------------
create or replace function fn_check_doctor_role()
returns trigger as $$
begin
    if not exists (select 1 from users where id = new.doctor_id and role in ('doctor','admin')) then
        raise exception 'doctor_id % does not reference a user with role doctor/admin', new.doctor_id;
    end if;
    if not exists (select 1 from users where id = new.patient_id and role = 'patient') then
        raise exception 'patient_id % does not reference a user with role patient', new.patient_id;
    end if;
    return new;
end;
$$ language plpgsql;

create trigger trg_check_appt_roles
    before insert or update on appointments
    for each row execute function fn_check_doctor_role();
