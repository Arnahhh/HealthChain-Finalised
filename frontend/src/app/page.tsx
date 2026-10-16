"use client";

import { useRouter } from "next/navigation";
import { useWalletAuth } from "../hooks/useWalletAuth";

export default function LoginPage() {
  const { connectAndSignIn, loading, error } = useWalletAuth();
  const router = useRouter();

  const handleConnect = async () => {
    const user = await connectAndSignIn().catch(() => null);
    if (!user) return;
    if (user.role === "doctor") router.push("/doctor");
    else if (user.role === "admin") router.push("/admin");
    else router.push("/patient");
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <div className="text-center">
        <h1 className="text-3xl font-bold">HealthChain</h1>
        <p className="mt-2 text-slate-600 max-w-md">
          Sign in with your Ethereum wallet. No passwords — your signature proves who you are, and the backend
          verifies it against a one-time nonce before issuing your session.
        </p>
      </div>

      <button
        onClick={handleConnect}
        disabled={loading}
        className="rounded-xl bg-indigo-600 px-6 py-3 text-white font-medium shadow hover:bg-indigo-700 disabled:opacity-50"
      >
        {loading ? "Waiting for signature..." : "Connect Wallet & Sign In"}
      </button>

      {error && <p className="text-red-600 text-sm max-w-md text-center">{error}</p>}

      <ol className="text-sm text-slate-500 mt-4 space-y-1 text-left">
        <li>1. Connect MetaMask</li>
        <li>2. Sign a message (free — no gas, no transaction)</li>
        <li>3. Backend recovers your address from the signature and verifies the nonce</li>
        <li>4. You're routed to your role-specific dashboard</li>
      </ol>
    </main>
  );
}
