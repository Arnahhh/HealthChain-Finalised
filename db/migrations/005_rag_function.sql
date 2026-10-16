-- =====================================================================
-- HealthChain: RAG retrieval helper (Migration 005)
-- Cosine-similarity search over a single patient's own past AI analyses,
-- used by backend/src/services/ai.service.ts to ground new report
-- analysis in that patient's history (longitudinal context).
-- security definer + explicit patient_id scoping keeps this safe to call
-- from the service-role client without leaking other patients' data.
-- =====================================================================

create or replace function match_patient_analyses(
    p_patient_id uuid,
    p_query_embedding vector(1536),
    p_match_count int default 3
)
returns table (
    analysis_id uuid,
    report_id uuid,
    summary text,
    similarity float
)
language sql stable
as $$
    select
        a.id as analysis_id,
        a.report_id,
        a.summary,
        1 - (a.embedding <=> p_query_embedding) as similarity
    from ai_analyses a
    join medical_reports mr on mr.id = a.report_id
    where mr.patient_id = p_patient_id
      and a.embedding is not null
    order by a.embedding <=> p_query_embedding
    limit p_match_count;
$$;
