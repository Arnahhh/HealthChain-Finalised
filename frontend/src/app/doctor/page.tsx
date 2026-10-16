"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/api";

export default function DoctorDashboard() {
  const [appointments, setAppointments] = useState<any[]>([]);

  useEffect(() => {
    api.getAppointments().then(setAppointments).catch(console.error);
  }, []);

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Doctor Dashboard</h1>
      <section>
        <h2 className="font-semibold mb-2">My Patients & Appointments</h2>
        <ul className="divide-y rounded-lg border bg-white">
          {appointments.map((a) => (
            <li key={a.appointment_id} className="p-3 text-sm flex justify-between">
              <div>
                <p className="font-medium">{a.patient_name}</p>
                <p className="text-slate-500">{a.patient_report_count} report(s) on file</p>
              </div>
              <span className="text-slate-500">{new Date(a.scheduled_at).toLocaleString()} · {a.status}</span>
            </li>
          ))}
          {appointments.length === 0 && <li className="p-3 text-slate-400 text-sm">No appointments yet.</li>}
        </ul>
      </section>
    </main>
  );
}
