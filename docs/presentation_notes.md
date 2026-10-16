# Presentation talking points

## One-line pitch
"A relational healthcare management system secured by Ethereum-based identity
and blockchain auditability, with AI-powered analysis of patient medical reports."

## Demo order (suggested)
1. Show the ER-style architecture diagram (README.md).
2. Live demo: connect MetaMask, sign in, land on role dashboard (Workflow 1).
3. Upload a mock lab report -> show it get hashed, anchored on Sepolia
   (show the tx on Sepolia Etherscan), and AI-summarized (Workflows 2 & 3
   happening in the same request).
4. Open Supabase table editor: show audit_logs populated automatically by
   the trigger, and blockchain_transactions row with a real tx_hash.
5. Log in as admin: show v_admin_analytics numbers and the doctor load chart.
6. Close on the DBMS design choices (see README "Why the DBMS layer is the
   strongest part of this project") -- this is likely your grading rubric.

## Anticipated questions & answers
- "Why not just use Supabase Auth?" -> Wallet-based auth demonstrates identity
  that isn't tied to a centralized auth provider; the wallet address IS the
  identity, and the signature proves control of it without a password.
- "Why hash + anchor instead of storing the file on-chain?" -> Gas cost and
  privacy: storing PHI on a public chain is both expensive and a compliance
  problem. Anchoring only the hash gives tamper-evidence without exposing data.
- "Why pgvector instead of a separate vector DB (Pinecone, etc.)?" -> Keeps
  the whole data model in one relational system, which is the point of a
  DBMS-focused project; pgvector is proven and sufficient at this scale.
