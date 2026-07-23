import React, { useEffect, useMemo, useState } from "react";
import { BACKEND_URL } from "../lib/api";
import { loadToken } from "../lib/auth";

function authHeaders(): Record<string, string> {
  const token = loadToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

type Team = { id: number; name: string; slug: string; created_at: number; updated_at: number };
type Member = {
  id: number;
  team_id: number;
  user_id: number;
  user_email: string;
  user_name: string;
  role: string;
  created_at: number;
};
type Audit = { id: number; actor_user_id: number | null; action: string; resource: string; meta: any; created_at: number };
type User = { id: number; email: string; name: string; role: string; is_active: boolean; created_at: number; updated_at: number };

async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${BACKEND_URL}${path}`, { headers: { ...authHeaders() } });
  if (!r.ok) throw new Error(`${path} failed: ${r.status}`);
  return (await r.json()) as T;
}

async function apiPost<T>(path: string, body: any): Promise<T> {
  const r = await fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`${path} failed: ${r.status} ${t}`);
  }
  return (await r.json()) as T;
}

async function apiPut<T>(path: string, body: any): Promise<T> {
  const r = await fetch(`${BACKEND_URL}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`${path} failed: ${r.status} ${t}`);
  }
  return (await r.json()) as T;
}

export function AdminModal(props: { onClose: () => void }) {
  const [tab, setTab] = useState<"teams" | "users" | "audit">("teams");
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeTeamId, setActiveTeamId] = useState<number | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [newTeamName, setNewTeamName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState<"member" | "admin" | "owner">("member");

  const activeTeam = useMemo(() => teams.find((t) => t.id === activeTeamId) ?? null, [teams, activeTeamId]);

  async function refreshTeams() {
    setErr(null);
    const t = await apiGet<Team[]>("/api/teams");
    setTeams(t);
    if (!activeTeamId && t.length) setActiveTeamId(t[0].id);
  }

  async function refreshMembers(teamId: number) {
    setErr(null);
    const m = await apiGet<Member[]>(`/api/teams/${teamId}/members`);
    setMembers(m);
  }

  async function refreshAudit() {
    setErr(null);
    const a = await apiGet<Audit[]>("/api/admin/audit?limit=200");
    setAudit(a);
  }

  async function refreshUsers() {
    setErr(null);
    const u = await apiGet<User[]>("/api/users");
    setUsers(u);
  }

  useEffect(() => {
    refreshTeams().catch((e) => setErr(String(e?.message ?? e)));
  }, []);

  useEffect(() => {
    if (!activeTeamId) return;
    refreshMembers(activeTeamId).catch((e) => setErr(String(e?.message ?? e)));
  }, [activeTeamId]);

  useEffect(() => {
    if (tab !== "audit") return;
    refreshAudit().catch((e) => setErr(String(e?.message ?? e)));
  }, [tab]);

  useEffect(() => {
    if (tab !== "users") return;
    refreshUsers().catch((e) => setErr(String(e?.message ?? e)));
  }, [tab]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") props.onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [props.onClose]);

  function onOverlayMouseDown(e: React.MouseEvent) {
    if (e.target === e.currentTarget) props.onClose();
  }

  return (
    <div className="modalOverlay adminModalOverlay" role="presentation" onMouseDown={onOverlayMouseDown}>
      <div
        className="modal adminModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="adminModalHeader">
          <div>
            <h2 id="admin-modal-title" className="adminModalTitle">
              管理后台
            </h2>
            <p className="adminModalSubtitle">团队、用户与审计</p>
          </div>
          <button type="button" className="adminModalClose" onClick={props.onClose} aria-label="关闭">
            <span className="adminModalCloseX" aria-hidden="true">
              ×
            </span>
            关闭
          </button>
        </header>

        <div className="adminTabsRow">
          <div className="adminTabs" role="tablist" aria-label="管理分区">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "teams"}
              className={`adminTab ${tab === "teams" ? "adminTab--active" : ""}`}
              onClick={() => setTab("teams")}
            >
              团队
              <span className="adminTabCount">{teams.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "users"}
              className={`adminTab ${tab === "users" ? "adminTab--active" : ""}`}
              onClick={() => setTab("users")}
            >
              用户
              <span className="adminTabCount">{users.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "audit"}
              className={`adminTab ${tab === "audit" ? "adminTab--active" : ""}`}
              onClick={() => setTab("audit")}
              title="审计日志"
            >
              审计日志
              <span className="adminTabCount">{audit.length}</span>
            </button>
          </div>
        </div>

        <div className="adminModalBody">
          {err ? <div className="adminAlert">{err}</div> : null}
          {tab === "teams" ? (
            <div className="adminTwoCol">
              <section className="adminPane" aria-label="团队列表">
                <div className="adminPaneHead">
                  <span className="adminPaneLabel">全部团队</span>
                </div>
                <div className="adminField">
                  <label className="adminFieldLabel" htmlFor="admin-new-team">
                    新建团队
                  </label>
                  <div className="adminToolbar">
                    <input
                      id="admin-new-team"
                      className="adminInput"
                      value={newTeamName}
                      placeholder="输入团队名称"
                      onChange={(e) => setNewTeamName(e.target.value)}
                    />
                    <button
                      type="button"
                      className="adminBtn adminBtnPrimary"
                      onClick={async () => {
                        try {
                          await apiPost<Team>("/api/teams", { name: newTeamName });
                          setNewTeamName("");
                          await refreshTeams();
                        } catch (e: any) {
                          setErr(String(e?.message ?? e));
                        }
                      }}
                    >
                      创建
                    </button>
                  </div>
                </div>
                <div className="adminScrollList">
                  {teams.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`adminListItem ${t.id === activeTeamId ? "adminListItem--active" : ""}`}
                      onClick={() => setActiveTeamId(t.id)}
                    >
                      <span className="adminListItemRow">
                        <span className="adminListItemText">
                          <span className="adminListItemTitle">{t.name}</span>
                          <span className="adminListItemMeta">{t.slug}</span>
                        </span>
                        <span className="adminListItemChevron" aria-hidden="true">
                          ›
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="adminPane adminPane--detail" aria-label="团队成员">
                {!activeTeam ? (
                  <div className="adminEmpty">
                    <span className="adminEmptyTitle">请选择团队</span>
                    <span className="adminEmptyHint">在左侧列表中选择一个团队以管理成员。</span>
                  </div>
                ) : (
                  <>
                    <div className="adminPaneHead">
                      <div className="adminPaneHeadText">
                        <span className="adminPaneTitle">{activeTeam.name}</span>
                        <span className="adminPaneSub">成员 {members.length} 人</span>
                      </div>
                      <button
                        type="button"
                        className="adminBtn adminBtnGhost"
                        onClick={() => refreshMembers(activeTeam.id).catch((e) => setErr(String(e?.message ?? e)))}
                      >
                        刷新
                      </button>
                    </div>

                    <div className="adminField">
                      <label className="adminFieldLabel" htmlFor="admin-add-member-email">
                        添加成员
                      </label>
                      <div className="adminToolbar adminToolbar--wrap">
                        <input
                          id="admin-add-member-email"
                          className="adminInput adminInput--grow"
                          value={addEmail}
                          placeholder="成员邮箱"
                          onChange={(e) => setAddEmail(e.target.value)}
                        />
                        <select className="adminSelect" value={addRole} onChange={(e) => setAddRole(e.target.value as any)} aria-label="成员角色">
                          <option value="member">member</option>
                          <option value="admin">admin</option>
                          <option value="owner">owner</option>
                        </select>
                        <button
                          type="button"
                          className="adminBtn adminBtnPrimary"
                          onClick={async () => {
                            try {
                              await apiPost<Member>(`/api/teams/${activeTeam.id}/members`, {
                                user_email: addEmail,
                                role: addRole
                              });
                              setAddEmail("");
                              await refreshMembers(activeTeam.id);
                            } catch (e: any) {
                              setErr(String(e?.message ?? e));
                            }
                          }}
                        >
                          添加
                        </button>
                      </div>
                    </div>

                    <div className="adminScrollList">
                      {members.map((m) => (
                        <div key={m.id} className="adminListItem adminListItem--static">
                          <div className="adminListItemText">
                            <span className="adminListItemTitle">
                              {m.user_name || "（未命名）"} · {m.user_email}
                            </span>
                            <span className="adminListItemMeta">
                              {m.role} · user #{m.user_id}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </section>
            </div>
          ) : tab === "users" ? (
            <div className="adminSingleCol">
              <div className="adminPaneHead">
                <span className="adminPaneLabel">用户目录</span>
                <button type="button" className="adminBtn adminBtnGhost" onClick={() => refreshUsers().catch((e) => setErr(String(e?.message ?? e)))}>
                  刷新
                </button>
              </div>
              <div className="adminScrollList adminScrollList--cards">
                {users.length === 0 ? (
                  <div className="adminEmpty adminEmpty--compact">
                    <span className="adminEmptyTitle">暂无用户</span>
                    <span className="adminEmptyHint">切换到本页后将加载用户列表。</span>
                  </div>
                ) : null}
                {users.map((u) => (
                  <div key={u.id} className="adminUserCard">
                    <div className="adminUserCardMain">
                      <span className="adminListItemTitle">{u.name || "（未命名）"}</span>
                      <span className="adminListItemMeta">{u.email}</span>
                      <span className="adminUserCardTags">
                        <span className="adminTag">{u.role}</span>
                        <span className={`adminTag ${u.is_active ? "adminTag--ok" : "adminTag--off"}`}>{u.is_active ? "已启用" : "已停用"}</span>
                        <span className="adminTag adminTag--muted">id {u.id}</span>
                      </span>
                    </div>
                    <div className="adminUserCardActions">
                      <button
                        type="button"
                        className="adminBtn adminBtnGhost"
                        onClick={() =>
                          apiPut<User>(`/api/users/${u.id}`, { role: u.role === "admin" ? "user" : "admin" })
                            .then(() => refreshUsers())
                            .catch((e) => setErr(String(e?.message ?? e)))
                        }
                      >
                        切换管理员
                      </button>
                      <button
                        type="button"
                        className={`adminBtn ${u.is_active ? "adminBtnDangerGhost" : "adminBtnPrimary"}`}
                        onClick={() =>
                          apiPut<User>(`/api/users/${u.id}`, { is_active: !u.is_active })
                            .then(() => refreshUsers())
                            .catch((e) => setErr(String(e?.message ?? e)))
                        }
                      >
                        {u.is_active ? "停用" : "启用"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="adminSingleCol">
              <div className="adminPaneHead">
                <span className="adminPaneLabel">最近 200 条</span>
                <button type="button" className="adminBtn adminBtnGhost" onClick={() => refreshAudit().catch((e) => setErr(String(e?.message ?? e)))}>
                  刷新
                </button>
              </div>
              <div className="adminScrollList adminScrollList--dense">
                {audit.length === 0 ? (
                  <div className="adminEmpty adminEmpty--compact">
                    <span className="adminEmptyTitle">暂无审计记录</span>
                    <span className="adminEmptyHint">有操作后将显示最近 200 条。</span>
                  </div>
                ) : null}
                {audit.map((a) => (
                  <div key={a.id} className="adminAuditRow">
                    <div className="adminAuditMain">
                      <span className="adminAuditAction">{a.action}</span>
                      <span className="adminAuditResource">{a.resource || "—"}</span>
                    </div>
                    <div className="adminAuditMeta">
                      <span>{new Date(a.created_at).toLocaleString()}</span>
                      <span className="adminAuditActor">actor {a.actor_user_id ?? "—"}</span>
                    </div>
                    <pre className="adminAuditJson">{JSON.stringify(a.meta)}</pre>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <footer className="adminModalFooter">Esc 关闭 · 点击空白处关闭</footer>
      </div>
    </div>
  );
}
