"""
Standalone RAG demo — mirrors backend/src/services/ai.service.ts in Python
so you can demo/explain the retrieval-augmented pipeline without spinning
up the full stack. Useful for a presentation or a notebook walkthrough.

Pipeline:
  1. Extraction  -> report text (assume already OCR'd/parsed)
  2. Embed       -> OpenAI text-embedding-3-small
  3. Retrieve    -> cosine similarity against this patient's past reports
  4. Generate    -> chat completion grounded in retrieved context
  5. Persist     -> (in the real app) written to ai_analyses via Supabase

Usage:
    export OPENAI_API_KEY=sk-...
    python rag_demo.py
"""

import os
import json
from openai import OpenAI

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

EMBEDDING_MODEL = "text-embedding-3-small"
CHAT_MODEL = "gpt-4o-mini"

# In the real system this comes from ai_analyses rows for this patient,
# retrieved via the match_patient_analyses() pgvector function.
MOCK_PATIENT_HISTORY = [
    {
        "summary": "Lipid panel from 3 months ago showed borderline-high LDL (138 mg/dL) and normal triglycerides.",
    }
]

NEW_REPORT_TEXT = """
LDL: 145 mg/dL, HDL: 42 mg/dL, Triglycerides: 180 mg/dL, Total Cholesterol: 220 mg/dL
"""

SYSTEM_PROMPT = """You are a clinical-decision-support assistant. You analyze medical report text
and produce a concise, cautious summary for a licensed doctor to review — you do NOT diagnose or
prescribe. Always include a recommendation to consult the treating physician. Respond ONLY with
JSON: {"summary": str, "flags": [str], "severity": "low"|"moderate"|"high", "recommendation": str,
"confidence": float between 0 and 1}"""


def embed(text: str):
    resp = client.embeddings.create(model=EMBEDDING_MODEL, input=text)
    return resp.data[0].embedding


def analyze(report_text: str, history: list[dict]):
    context = "\n".join(f"- {h['summary']}" for h in history) or "No prior reports on file."
    user_prompt = f"Patient's longitudinal context:\n{context}\n\nNew report text:\n{report_text}"

    completion = client.chat.completions.create(
        model=CHAT_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.2,
    )
    return json.loads(completion.choices[0].message.content)


if __name__ == "__main__":
    embedding = embed(NEW_REPORT_TEXT)
    print(f"Generated embedding of length {len(embedding)} (used for pgvector retrieval in prod)")

    result = analyze(NEW_REPORT_TEXT, MOCK_PATIENT_HISTORY)
    print(json.dumps(result, indent=2))
