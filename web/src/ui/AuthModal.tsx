import React, { useState } from "react";
import { login } from "../lib/api";
import { saveToken } from "../lib/auth";

export function AuthModal(props: { onAuthed: () => void }) {
  const [email, setEmail] = useState("admin@local");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr(null);
    setBusy(true);
    try {
      const res = await login(email.trim(), password);
      saveToken(res.access_token);
      props.onAuthed();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true">
      <div className="card modal">
        <div className="modalHeader">
          <strong>Sign in</strong>
        </div>
        <div className="formGrid">
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
          </div>
        </div>

        {err ? (
          <div className="helpText" style={{ color: "var(--danger)" }}>
            {err}
          </div>
        ) : (
          <div className="helpText">
            Use `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` in `backend/.env` to create your first admin.
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
          <button className="btn btnPrimary" disabled={busy} onClick={submit}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}

