import React, { useEffect, useState } from "react";
import { loadToken } from "../lib/auth";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "http://127.0.0.1:8787";

function authHeaders(): Record<string, string> {
  const token = loadToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

type Kb = { id: number; name: string };
type KbDoc = { id: number; filename: string; chunk_count: number };

export function KbPanel() {
  const [kbs, setKbs] = useState<Kb[]>([]);
  const [activeKbId, setActiveKbId] = useState<number | null>(null);
  const [docs, setDocs] = useState<KbDoc[]>([]);
  const [name, setName] = useState("My Knowledge Base");
  const [query, setQuery] = useState("");
  const [searchResult, setSearchResult] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  async function refreshKbs() {
    setErr(null);
    const r = await fetch(`${BACKEND_URL}/api/kb`, { headers: { ...authHeaders() } });
    if (!r.ok) throw new Error(`List KB failed: ${r.status}`);
    const rows = (await r.json()) as Kb[];
    setKbs(rows);
    if (!activeKbId && rows.length) setActiveKbId(rows[0].id);
  }

  async function refreshDocs(kbId: number) {
    const r = await fetch(`${BACKEND_URL}/api/kb/${kbId}/docs`, { headers: { ...authHeaders() } });
    if (!r.ok) throw new Error(`List docs failed: ${r.status}`);
    setDocs((await r.json()) as KbDoc[]);
  }

  useEffect(() => {
    refreshKbs().catch((e) => setErr(String(e?.message ?? e)));
  }, []);

  useEffect(() => {
    if (!activeKbId) return;
    refreshDocs(activeKbId).catch((e) => setErr(String(e?.message ?? e)));
  }, [activeKbId]);

  return (
    <div className="kbRoot">
      {err ? (
        <div className="helpText" style={{ color: "var(--danger)" }}>
          {err}
        </div>
      ) : null}

      <div className="kbRow">
        <input className="kbGrow" value={name} onChange={(e) => setName(e.target.value)} />
        <button
          className="btn btnPrimary"
          onClick={async () => {
            try {
              const r = await fetch(`${BACKEND_URL}/api/kb`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify({ name })
              });
              if (!r.ok) throw new Error(`Create KB failed: ${r.status}`);
              await refreshKbs();
            } catch (e: any) {
              setErr(String(e?.message ?? e));
            }
          }}
        >
          Create KB
        </button>
      </div>

      <div className="kbPills">
        {kbs.map((kb) => (
          <button
            key={kb.id}
            className={`btn ${activeKbId === kb.id ? "btnPrimary" : ""}`}
            onClick={() => setActiveKbId(kb.id)}
          >
            {kb.name}
          </button>
        ))}
      </div>

      {activeKbId ? (
        <>
          <div style={{ marginTop: 10 }}>
            <input
              type="file"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const fd = new FormData();
                fd.append("file", f);
                try {
                  const r = await fetch(`${BACKEND_URL}/api/kb/${activeKbId}/upload`, {
                    method: "POST",
                    headers: { ...authHeaders() },
                    body: fd
                  });
                  if (!r.ok) {
                    const t = await r.text().catch(() => "");
                    throw new Error(`Upload failed: ${r.status} ${t}`);
                  }
                  await refreshDocs(activeKbId);
                } catch (e: any) {
                  setErr(String(e?.message ?? e));
                }
              }}
            />
          </div>

          <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
            {docs.map((d) => (
              <div key={d.id} className="sessionMeta">
                {d.filename} · chunks {d.chunk_count}
              </div>
            ))}
          </div>

          <div className="kbRow">
            <input className="kbGrow" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Test retrieval query" />
            <button
              className="btn"
              onClick={async () => {
                try {
                  const r = await fetch(`${BACKEND_URL}/api/kb/${activeKbId}/search`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", ...authHeaders() },
                    body: JSON.stringify({ query, top_k: 5 })
                  });
                  if (!r.ok) throw new Error(`Search failed: ${r.status}`);
                  setSearchResult(JSON.stringify(await r.json(), null, 2));
                } catch (e: any) {
                  setErr(String(e?.message ?? e));
                }
              }}
            >
              Search
            </button>
          </div>
          {searchResult ? (
            <pre className="kbResult">{searchResult}</pre>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

