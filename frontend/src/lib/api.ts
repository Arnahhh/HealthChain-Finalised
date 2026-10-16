const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("healthchain_token");
}

export function setToken(token: string) {
  localStorage.setItem("healthchain_token", token);
}

export function clearToken() {
  localStorage.removeItem("healthchain_token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ? JSON.stringify(body.error) : `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  getNonce: (wallet_address: string) =>
    request<{ message: string; nonce: string }>("/api/auth/nonce", {
      method: "POST",
      body: JSON.stringify({ wallet_address }),
    }),
  verify: (wallet_address: string, message: string, signature: string) =>
    request<{ token: string; user: any }>("/api/auth/verify", {
      method: "POST",
      body: JSON.stringify({ wallet_address, message, signature }),
    }),
  getAppointments: () => request<any[]>("/api/appointments"),
  createAppointment: (body: { doctor_id: string; scheduled_at: string; reason?: string }) =>
    request("/api/appointments", { method: "POST", body: JSON.stringify(body) }),
  getReports: () => request<any[]>("/api/reports"),
  uploadReport: (form: FormData) => request("/api/reports", { method: "POST", body: form }),
  getAnalytics: () => request<any>("/api/admin/analytics"),
  getDoctorLoad: () => request<any[]>("/api/admin/doctor-load"),
};
