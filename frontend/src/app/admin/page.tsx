"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { api } from "../../lib/api";

export default function AdminDashboard() {
  const [analytics, setAnalytics] = useState<any>(null);
  const [load, setLoad] = useState<any[]>([]);

  useEffect(() => {
    api.getAnalytics().then(setAnalytics).catch(console.error);
    api.getDoctorLoad().then(setLoad).catch(console.error);
  }, []);

  const stat = (label: string, value: any) => (
    <div className="bg-white border rounded-lg p-4">
      <p className="text-slate-500 text-xs">{label}</p>
      <p className="text-2xl font-bold">{value ?? "—"}</p>
    </div>
  );

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-bold">Admin Analytics</h1>

      {analytics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stat("Patients", analytics.total_patients)}
          {stat("Doctors", analytics.total_doctors)}
          {stat("Appointments", analytics.total_appointments)}
          {stat("Completed", analytics.completed_appointments)}
          {stat("Reports", analytics.total_reports)}
          {stat("AI Analyses", analytics.total_ai_analyses)}
          {stat("Confirmed On-Chain Tx", analytics.confirmed_chain_txs)}
          {stat("Pending On-Chain Tx", analytics.pending_chain_txs)}
        </div>
      )}

      <section>
        <h2 className="font-semibold mb-2">Doctor Weekly Load</h2>
        <div className="bg-white border rounded-lg p-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={load}>
              <XAxis dataKey="doctor_id" hide />
              <YAxis />
              <Tooltip />
              <Bar dataKey="appointment_count" fill="#4f46e5" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </main>
  );
}
