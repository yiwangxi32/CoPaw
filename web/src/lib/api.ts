import { BackendConfig, ChatSseEvent } from "./types";
import { loadToken } from "./auth";

export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "/api";

function authHeaders(): Record<string, string> {
  const token = loadToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchBackendConfig(): Promise<BackendConfig> {
  const r = await fetch(`${BACKEND_URL}/api/config`, { headers: { ...authHeaders() } });
  if (!r.ok) throw new Error(`Backend config error: ${r.status}`);
  return (await r.json()) as BackendConfig;
}

export async function login(email: string, password: string): Promise<{ access_token: string }> {
  const r = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    let message = "登录失败";
    try {
      const json = JSON.parse(text);
      if (json.detail) {
        if (Array.isArray(json.detail)) {
          const errors: string[] = [];
          json.detail.forEach((item: any) => {
            if (item.loc && item.msg) {
              const field = item.loc[item.loc.length - 1];
              if (field === "email") {
                errors.push("邮箱格式不正确");
              } else if (field === "password") {
                errors.push("密码不能为空");
              } else {
                errors.push(item.msg);
              }
            } else if (typeof item === "string") {
              errors.push(item);
            }
          });
          message = errors.join("，");
        } else if (typeof json.detail === "string") {
          message = json.detail;
        }
      }
    } catch {
      if (r.status === 401) {
        message = "邮箱或密码错误";
      } else if (r.status === 422) {
        message = "请检查输入信息";
      }
    }
    throw new Error(message);
  }
  return (await r.json()) as { access_token: string };
}

export async function me(): Promise<{ email: string; name: string; role: string; is_active: boolean }> {
  const r = await fetch(`${BACKEND_URL}/api/users/me`, { headers: { ...authHeaders() } });
  if (!r.ok) throw new Error(`Me error: ${r.status}`);
  return (await r.json()) as { email: string; name: string; role: string; is_active: boolean };
}

export async function streamChat(args: {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  signal?: AbortSignal;
  onEvent: (evt: ChatSseEvent) => void;
}) {
  const r = await fetch(`${BACKEND_URL}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ messages: args.messages }),
    signal: args.signal
  });

  if (!r.ok || !r.body) {
    const text = await r.text().catch(() => "");
    throw new Error(`Chat stream error: ${r.status} ${text}`);
  }

  const reader = r.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames separated by \n\n
    while (true) {
      const idx = buffer.indexOf("\n\n");
      if (idx < 0) break;
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      const line = frame
        .split("\n")
        .map((s) => s.trimEnd())
        .find((s) => s.startsWith("data:"));
      if (!line) continue;
      const jsonStr = line.slice("data:".length).trim();
      if (!jsonStr) continue;
      try {
        const evt = JSON.parse(jsonStr) as ChatSseEvent;
        args.onEvent(evt);
      } catch {
        // ignore parse errors
      }
    }
  }
}

export type ChatSessionSummary = { id: number; title: string; kb_id?: number | null; created_at: number; updated_at: number };
export type ChatSessionMessage = { id: number; role: string; content: string; created_at: number };

export async function listChatSessions(): Promise<ChatSessionSummary[]> {
  const r = await fetch(`${BACKEND_URL}/api/chat-sessions`, { headers: { ...authHeaders() } });
  if (!r.ok) throw new Error(`List sessions error: ${r.status}`);
  return (await r.json()) as ChatSessionSummary[];
}

export async function createChatSession(args?: { title?: string; system_prompt?: string; kb_id?: number | null }): Promise<ChatSessionSummary> {
  const r = await fetch(`${BACKEND_URL}/api/chat-sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(args ?? {})
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Create session error: ${r.status} ${t}`);
  }
  return (await r.json()) as ChatSessionSummary;
}

export async function updateChatSession(
  id: number,
  args: { kb_id?: number | null; title?: string }
): Promise<ChatSessionSummary> {
  const r = await fetch(`${BACKEND_URL}/api/chat-sessions/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(args)
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Update session error: ${r.status} ${t}`);
  }
  return (await r.json()) as ChatSessionSummary;
}

export async function listKbs(): Promise<Array<{ id: number; name: string }>> {
  const r = await fetch(`${BACKEND_URL}/api/kb`, { headers: { ...authHeaders() } });
  if (!r.ok) throw new Error(`List KB failed: ${r.status}`);
  return (await r.json()) as Array<{ id: number; name: string }>;
}

export async function deleteChatSession(id: number): Promise<void> {
  const r = await fetch(`${BACKEND_URL}/api/chat-sessions/${id}`, {
    method: "DELETE",
    headers: { ...authHeaders() }
  });
  if (!r.ok) throw new Error(`Delete session error: ${r.status}`);
}

export async function listChatMessages(sessionId: number): Promise<ChatSessionMessage[]> {
  const r = await fetch(`${BACKEND_URL}/api/chat-sessions/${sessionId}/messages`, { headers: { ...authHeaders() } });
  if (!r.ok) throw new Error(`List messages error: ${r.status}`);
  return (await r.json()) as ChatSessionMessage[];
}

export async function exportChatSession(sessionId: number): Promise<any> {
  const r = await fetch(`${BACKEND_URL}/api/chat-sessions/${sessionId}/export`, { headers: { ...authHeaders() } });
  if (!r.ok) throw new Error(`Export error: ${r.status}`);
  return await r.json();
}

export async function shareChatSession(sessionId: number): Promise<{ token: string }> {
  const r = await fetch(`${BACKEND_URL}/api/chat-sessions/${sessionId}/share`, {
    method: "POST",
    headers: { ...authHeaders() }
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Share error: ${r.status} ${t}`);
  }
  return (await r.json()) as { token: string };
}

export async function streamChatToSession(args: {
  sessionId: number;
  user_message: string;
  files?: FileList;
  signal?: AbortSignal;
  onEvent: (evt: ChatSseEvent) => void;
}) {
  const hasFiles = args.files && args.files.length > 0;
  let body: BodyInit;
  if (hasFiles) {
    const fd = new FormData();
    fd.append("user_message", args.user_message);
    for (let i = 0; i < args.files!.length; i++) {
      fd.append("files", args.files![i]);
    }
    body = fd;
  } else {
    body = JSON.stringify({ user_message: args.user_message });
  }
  const r = await fetch(`${BACKEND_URL}/api/chat-sessions/${args.sessionId}/stream`, {
    method: "POST",
    headers: hasFiles ? authHeaders() : { "Content-Type": "application/json", ...authHeaders() },
    body,
    signal: args.signal
  });
  if (!r.ok || !r.body) {
    const text = await r.text().catch(() => "");
    throw new Error(`Chat stream error: ${r.status} ${text}`);
  }
  const reader = r.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    while (true) {
      const idx = buffer.indexOf("\n\n");
      if (idx < 0) break;
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const line = frame
        .split("\n")
        .map((s) => s.trimEnd())
        .find((s) => s.startsWith("data:"));
      if (!line) continue;
      const jsonStr = line.slice("data:".length).trim();
      if (!jsonStr) continue;
      try {
        const evt = JSON.parse(jsonStr) as ChatSseEvent;
        args.onEvent(evt);
      } catch {
        // ignore
      }
    }
  }
}

export async function heartbeat(): Promise<{ ok: boolean; user: { email: string; role: string }; message: string }> {
  const r = await fetch(`${BACKEND_URL}/api/system/heartbeat`, { headers: { ...authHeaders() } });
  if (!r.ok) throw new Error(`Heartbeat error: ${r.status}`);
  return (await r.json()) as { ok: boolean; user: { email: string; role: string }; message: string };
}

export async function listSystemTools(): Promise<Array<{ name: string; description: string; parameters: any }>> {
  const r = await fetch(`${BACKEND_URL}/api/system/tools`, { headers: { ...authHeaders() } });
  if (!r.ok) throw new Error(`Tools error: ${r.status}`);
  const data = (await r.json()) as { ok: boolean; tools: Array<{ name: string; description: string; parameters: any }> };
  return data.tools;
}

export async function listMcpServers(): Promise<Array<{ name: string; status: string }>> {
  const r = await fetch(`${BACKEND_URL}/api/system/mcp`, { headers: { ...authHeaders() } });
  if (!r.ok) throw new Error(`MCP error: ${r.status}`);
  const data = (await r.json()) as { ok: boolean; servers: Array<{ name: string; status: string }> };
  return data.servers;
}

export async function listOllamaModels(): Promise<string[]> {
  const r = await fetch(`${BACKEND_URL}/api/system/ollama/models`, { headers: { ...authHeaders() } });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Ollama models error: ${r.status} ${t}`);
  }
  const data = (await r.json()) as { ok: boolean; models: string[] };
  return data.models ?? [];
}

export async function pullOllamaModel(model: string): Promise<{ ok: boolean; model: string; status: string }> {
  const r = await fetch(`${BACKEND_URL}/api/system/ollama/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ model })
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    const err = new Error(`Pull model error: ${r.status} ${t}`) as Error & { status?: number; body?: string };
    err.status = r.status;
    err.body = t;
    throw err;
  }
  return (await r.json()) as { ok: boolean; model: string; status: string };
}

export type ModelProfile = {
  id: number;
  name: string;
  provider: string;
  base_url: string;
  model: string;
  rpm_limit: number;
  is_active: boolean;
  is_ready?: boolean;
};

export async function listModelProfiles(): Promise<ModelProfile[]> {
  const r = await fetch(`${BACKEND_URL}/api/models/profiles`, { headers: { ...authHeaders() } });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Model profiles error: ${r.status} ${t}`);
  }
  return (await r.json()) as ModelProfile[];
}

export async function activateModelProfile(profileId: number): Promise<{ ok: boolean }> {
  const r = await fetch(`${BACKEND_URL}/api/models/active`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ profile_id: profileId })
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Activate profile error: ${r.status} ${t}`);
  }
  return (await r.json()) as { ok: boolean };
}

export async function createModelProfile(payload: {
  name: string;
  provider: string;
  base_url: string;
  api_key: string;
  model: string;
  rpm_limit: number;
}): Promise<ModelProfile> {
  const r = await fetch(`${BACKEND_URL}/api/models/profiles`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload)
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Create profile error: ${r.status} ${t}`);
  }
  return (await r.json()) as ModelProfile;
}

export type RuntimeSettings = {
  openai_base_url: string;
  openai_default_model: string;
  openai_api_key_set: boolean;
  openai_api_key_hint: string;
  ollama_base_url: string;
  copaw_preset_models: string;
  copaw_ollama_preset_models: string;
};

export type RuntimeSettingsUpdate = {
  openai_base_url?: string | null;
  openai_default_model?: string | null;
  openai_api_key?: string | null;
  clear_openai_api_key?: boolean;
  ollama_base_url?: string | null;
  copaw_preset_models?: string | null;
  copaw_ollama_preset_models?: string | null;
};

export async function fetchRuntimeSettings(): Promise<RuntimeSettings> {
  const r = await fetch(`${BACKEND_URL}/api/settings/runtime`, { headers: { ...authHeaders() } });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Runtime settings error: ${r.status} ${t}`);
  }
  return (await r.json()) as RuntimeSettings;
}

export async function updateRuntimeSettings(payload: RuntimeSettingsUpdate): Promise<RuntimeSettings> {
  const r = await fetch(`${BACKEND_URL}/api/settings/runtime`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload)
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Update settings error: ${r.status} ${t}`);
  }
  return (await r.json()) as RuntimeSettings;
}

