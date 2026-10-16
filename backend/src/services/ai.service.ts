import OpenAI from "openai";
import { supabaseAdmin } from "../config/supabase.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
const CHAT_MODEL = process.env.CHAT_MODEL || "gpt-4o-mini";

/**
 * WORKFLOW 2 — AI MEDICAL ANALYSIS (RAG)
 *
 * 1. Extraction: report text (already OCR'd/parsed into medical_reports.raw_text)
 * 2. Embed the new report's text.
 * 3. Retrieve: pgvector similarity search over ai_analyses.embedding for the
 *    SAME patient's prior reports, giving the model longitudinal context
 *    (e.g. "cholesterol was already borderline 3 months ago").
 * 4. Generate: chat completion grounded in the report text + retrieved
 *    context, constrained to return structured JSON findings.
 * 5. Persist: store summary + findings + embedding in ai_analyses so future
 *    reports for this patient can retrieve THIS one.
 */

async function embed(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: text });
  return res.data[0].embedding;
}

async function retrieveSimilarPastAnalyses(patientId: string, queryEmbedding: number[], limit = 3) {
  // pgvector cosine-distance search, scoped to this patient's own reports.
  const { data, error } = await supabaseAdmin.rpc("match_patient_analyses", {
    p_patient_id: patientId,
    p_query_embedding: queryEmbedding,
    p_match_count: limit,
  });
  if (error) {
    console.warn("Retrieval RPC failed, continuing without prior context:", error.message);
    return [];
  }
  return data ?? [];
}

export async function analyzeReport(params: { reportId: string; patientId: string; reportText: string }) {
  const { reportId, patientId, reportText } = params;

  const queryEmbedding = await embed(reportText);
  const priorContext = await retrieveSimilarPastAnalyses(patientId, queryEmbedding);

  const contextBlock = priorContext.length
    ? priorContext.map((c: any, i: number) => `Prior report ${i + 1} summary: ${c.summary}`).join("\n")
    : "No prior reports on file for this patient.";

  const systemPrompt = `You are a clinical-decision-support assistant. You analyze structured/unstructured
medical report text and produce a concise, cautious summary for a licensed doctor to review — you do NOT
diagnose or prescribe. Always include a "recommendation" to consult the treating physician. Respond ONLY
with JSON matching: {"summary": string, "flags": string[], "severity": "low"|"moderate"|"high", "recommendation": string, "confidence": number between 0 and 1}`;

  const userPrompt = `Patient's longitudinal context:\n${contextBlock}\n\nNew report text:\n${reportText}`;

  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
  });

  const raw = completion.choices[0].message.content ?? "{}";
  const parsed = JSON.parse(raw) as {
    summary: string;
    flags: string[];
    severity: string;
    recommendation: string;
    confidence: number;
  };

  const { data: saved, error } = await supabaseAdmin
    .from("ai_analyses")
    .insert({
      report_id: reportId,
      summary: parsed.summary,
      findings: { flags: parsed.flags, severity: parsed.severity, recommendation: parsed.recommendation },
      embedding: queryEmbedding,
      model_used: CHAT_MODEL,
      confidence: parsed.confidence,
    })
    .select()
    .single();

  if (error) throw error;
  return saved;
}
