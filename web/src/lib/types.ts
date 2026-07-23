export type Role = "system" | "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
};

export type ChatSession = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
};

export type BackendConfig = {
  provider: string;
  model: string;
  auth_disabled?: boolean;
};

export type ChatSseEvent =
  | { type: "meta"; data: { provider: string; model: string } }
  | { type: "delta"; data: { text: string } }
  | { type: "done"; data: { elapsed_ms: number } }
  | { type: "error"; data: { message: string } };

