import "./globals.css";

export const metadata = {
  title: "HealthChain — Blockchain-Secured Healthcare Platform",
  description: "Wallet-authenticated healthcare platform with AI report analysis and on-chain audit trails.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
