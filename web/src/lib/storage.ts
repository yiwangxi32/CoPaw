import { ChatSession } from "./types";

const SESSIONS_KEY = "copaw.sessions.v1";
const ACTIVE_KEY = "copaw.activeSessionId.v1";

export function loadSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatSession[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveSessions(sessions: ChatSession[]) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

export function loadActiveSessionId(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}

export function saveActiveSessionId(id: string) {
  localStorage.setItem(ACTIVE_KEY, id);
}

