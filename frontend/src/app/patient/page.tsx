"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/api";

export default function PatientDashboard() {
  const [appointments, setAppointments] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api.getAppointments().then(setAppointments).catch(console.error);
    api.getReports().then(setReports).catch(console.error);
  }, []);

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setUploading(true);
    const form = new FormData(e.currentTarget);
    try {
      await api.uploadReport(form);
      setReports(await api.getReports());
      e.currentTarget.reset();
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-bold">Patient Dashboard</h1>

      <section>
        <h2 className="font-semibold mb-2">Upcoming Appointments</h2>
        <ul className="divide-y rounded-lg border bg-white">
          {appointments.map((a) => (
            <li key={a.appointment_id} className="p-3 flex justify-between text-sm">
              <span>{a.doctor_name} — {a.specialization}</span>
              <span className="text-slate-500">{new Date(a.scheduled_at).toLocaleString()} · {a.appointment_status}</span>
            </li>
          ))}
          {appointments.length === 0 && <li className="p-3 text-slate-400 text-sm">No appointments yet.</li>}
        </ul>
      </section>

      <section>
        <h2 className="font-semibold mb-2">Medical Reports & AI Analysis</h2>
        <ul className="divide-y rounded-lg border bg-white">
          {reports.map((r) => (
            <li key={r.report_id} className="p-3 text-sm">
              <div className="flex justify-between">
                <span className="font-medium">{r.title}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${r.blockchain_status === "confirmed" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                  {r.blockchain_status ?? "not anchored"}
                </span>
              </div>
              {r.summary && <p className="text-slate-600 mt-1">{r.summary}</p>}
              {r.tx_hash && <p className="text-xs text-slate-400 mt-1 truncate">tx: {r.tx_hash}</p>}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-semibold mb-2">Upload a New Report</h2>
        <form onSubmit={handleUpload} className="space-y-2 bg-white border rounded-lg p-4">
          <input type="hidden" name="patient_id" value="" />
          <input name="title" placeholder="Report title" required className="w-full border rounded p-2 text-sm" />
          <select name="report_type" className="w-full border rounded p-2 text-sm">
            <option value="lab_result">Lab Result</option>
            <option value="imaging">Imaging</option>
            <option value="discharge_summary">Discharge Summary</option>
            <option value="consultation_note">Consultation Note</option>
            <option value="other">Other</option>
          </select>
          <textarea name="raw_text" placeholder="Paste extracted report text (for AI analysis)" className="w-full border rounded p-2 text-sm" rows={3} />
          <input type="file" name="file" required className="w-full text-sm" />
          <button disabled={uploading} className="rounded bg-indigo-600 text-white px-4 py-2 text-sm disabled:opacity-50">
            {uploading ? "Uploading & anchoring..." : "Upload"}
          </button>
        </form>
      </section>
    </main>
  );
}
