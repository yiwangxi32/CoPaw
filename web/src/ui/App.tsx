import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  activateModelProfile,
  createChatSession,
  createModelProfile,
  deleteChatSession,
  fetchBackendConfig,
  listOllamaModels,
  listChatMessages,
  listModelProfiles,
  listChatSessions,
  ModelProfile,
  me,
  pullOllamaModel,
  streamChatToSession,
  updateChatSession
} from "../lib/api";
import { clearToken, loadToken } from "../lib/auth";
import { newId } from "../lib/id";
import { BackendConfig } from "../lib/types";
import { AuthModal } from "./AuthModal";
import { RuntimeSettingsModal } from "./RuntimeSettingsModal";
import { LoginPage } from "./LoginPage";
import pandaIcon from "./copaw-icon.svg";

const DEFAULT_SYSTEM_PROMPT =
  "You are CoPaw, a helpful assistant. Be concise, correct, and safe.";

// Snapshot from https://ollama.com/library used by custom add-model prompt.
const OLLAMA_LIBRARY_MODELS = new Set<string>([
  "llama3.1", "deepseek-r1", "llama3.2", "nomic-embed-text", "gemma3", "mistral", "qwen2.5", "qwen3", "llama3", "gemma2",
  "phi3", "qwen2.5-coder", "llava", "mxbai-embed-large", "gpt-oss", "phi4", "gemma", "qwen3.5", "llama2", "qwen", "qwen2",
  "codellama", "minicpm-v", "qwen3-coder", "tinyllama", "gemma4", "llama3.2-vision", "mistral-nemo", "deepseek-coder", "bge-m3",
  "deepseek-v3", "dolphin3", "llama3.3", "olmo2", "qwen3-vl", "smollm2", "snowflake-arctic-embed", "all-minilm", "mistral-small",
  "codegemma", "granite3.1-moe", "orca-mini", "starcoder2", "mixtral", "falcon3", "llama2-uncensored", "deepseek-coder-v2",
  "llava-llama3", "qwq", "cogito", "qwen2.5vl", "dolphin-llama3", "qwen3-embedding", "mistral-small3.2", "smollm", "dolphin-mixtral",
  "llama4", "gemma3n", "dolphin-phi", "phi4-reasoning", "phi", "dolphin-mistral", "magistral", "command-r", "granite-code",
  "hermes3", "deepscaler", "codestral", "translategemma", "glm-4.7-flash", "granite4", "yi", "lfm2.5-thinking", "zephyr",
  "mistral-large", "wizard-vicuna-uncensored", "moondream", "openthinker", "qwen3-coder-next", "phi4-mini", "wizardlm2", "lfm2",
  "starcoder", "glm4", "nous-hermes", "deepseek-v2", "deepseek-llm", "openchat", "embeddinggemma", "falcon", "vicuna", "codeqwen",
  "openhermes", "granite3.3", "qwen2-math", "aya", "ministral-3", "llama2-chinese", "neural-chat", "stable-code", "nous-hermes2",
  "sqlcoder", "wizardcoder", "yi-coder", "stablelm2", "devstral", "llama3-chatqa", "granite3-dense", "granite3.1-dense", "dolphincoder",
  "wizard-math", "llama3-gradient", "llama-guard3", "samantha-mistral", "llama3-groq-tool-use", "phi3.5", "internlm2", "granite3.2-vision",
  "starling-lm", "solar", "aya-expanse", "phind-codellama", "xwinlm", "granite3-moe", "yarn-llama2", "orca2", "deepcoder",
  "stable-beluga", "reader-lm", "shieldgemma", "paraphrase-multilingual", "llama-pro", "bakllava", "yarn-mistral", "nexusraven",
  "wizardlm", "devstral-small-2", "command-r-plus", "mistral-small3.1", "exaone-deep", "meditron", "tinydolphin", "deepseek-v3.1",
  "codegeex4", "mistral-openorca", "nemotron-mini", "wizardlm-uncensored", "opencoder", "reflection", "nemotron", "athene-v2",
  "nous-hermes2-mixtral", "codeup", "qwen3-next", "megadolphin", "medllama2", "everythinglm", "solar-pro", "magicoder", "mathstral",
  "notus", "notux", "falcon2", "stablelm-zephyr", "nuextract", "duckdb-nsql", "exaone3.5", "bespoke-minicheck", "mistrallite",
  "firefunction-v2", "wizard-vicuna", "open-orca-platypus2", "codebooga", "rnj-1", "goliath", "deepseek-ocr", "granite3.2",
  "olmo-3", "nemotron-3-nano", "r1-1776", "sailor2", "snowflake-arctic-embed2", "tulu3", "granite-embedding", "granite3-guardian",
  "qwen3.6", "dbrx", "llava-phi3", "glm-ocr", "deepseek-v2.5", "olmo-3.1", "bge-large", "phi4-mini-reasoning", "kimi-k2.5",
  "command-r7b", "nemotron-3-super", "smallthinker", "alfred", "command-a", "devstral-2", "marco-o1", "glm-5",
  "nomic-embed-text-v2-moe", "command-r7b-arabic", "cogito-2.1", "minimax-m2.5", "functiongemma", "gemini-3-flash-preview",
  "gpt-oss-safeguard", "glm-4.6", "glm-5.1", "minimax-m2", "nemotron-cascade-2", "glm-4.7", "minimax-m2.7", "deepseek-v3.2",
  "kimi-k2", "kimi-k2-thinking", "mistral-large-3", "minimax-m2.1", "kimi-k2.6", "medgemma", "medgemma1.5"
]);

function modelDisplayName(model?: string | null): string {
  const raw = (model || "").trim();
  if (!raw) return "";
  const idx = raw.indexOf(":");
  const base = idx > 0 ? raw.slice(0, idx) : raw;
  // Keep functional suffixes like "-mini"; only hide pure preview suffix in UI.
  return base.replace(/-preview$/i, "");
}

/** 侧栏收起时显示：向右展开（与参考图一致） */
function SidebarExpandIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" className="sidebarPanelGlyph">
      <path fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" d="M2.5 4h15M2.5 16h15" />
      <path fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M5 7.5l3 2.5-3 2.5M10 6v8M10 10h5" />
    </svg>
  );
}

/** 侧栏展开时显示：向左收起（与上图镜像） */
function SidebarCollapseIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" className="sidebarPanelGlyph">
      <path fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" d="M2.5 4h15M2.5 16h15" />
      <path fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M15 7.5l-3 2.5 3 2.5M10 6v8M10 10H5" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
      <path
        d="M11.4 2.5a1 1 0 0 0-2.8 0l-.2 1a6.7 6.7 0 0 0-1.5.6l-.9-.6a1 1 0 0 0-1.3.2l-1.1 1.1a1 1 0 0 0-.2 1.3l.6.9a6.7 6.7 0 0 0-.6 1.5l-1 .2a1 1 0 0 0 0 2.8l1 .2c.1.5.3 1 .6 1.5l-.6.9a1 1 0 0 0 .2 1.3l1.1 1.1a1 1 0 0 0 1.3.2l.9-.6c.5.3 1 .5 1.5.6l.2 1a1 1 0 0 0 2.8 0l.2-1c.5-.1 1-.3 1.5-.6l.9.6a1 1 0 0 0 1.3-.2l1.1-1.1a1 1 0 0 0 .2-1.3l-.6-.9c.3-.5.5-1 .6-1.5l1-.2a1 1 0 0 0 0-2.8l-1-.2a6.7 6.7 0 0 0-.6-1.5l.6-.9a1 1 0 0 0-.2-1.3l-1.1-1.1a1 1 0 0 0-1.3-.2l-.9.6a6.7 6.7 0 0 0-1.5-.6l-.2-1Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="2.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

type UiMsg = {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  createdAt: number;
  sessionId?: number;
};

export function App() {
  const [sessions, setSessions] = useState<Array<{ id: number; title: string; updated_at: number }>>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<UiMsg[]>([]);
  /** 存储每个会话的消息，用于历史记录面板 */
  const [sessionMessages, setSessionMessages] = useState<Record<number, UiMsg[]>>({});

  const [query, setQuery] = useState("");
  const [backendConfig, setBackendConfig] = useState<BackendConfig | null>(null);
  const [backendOk, setBackendOk] = useState<boolean>(false);
  const [authedUser, setAuthedUser] = useState<{ email: string; name: string; role: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [modelProfiles, setModelProfiles] = useState<ModelProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<number | null>(null);
  const [modelSwitching, setModelSwitching] = useState(false);
  const [modelLoadError, setModelLoadError] = useState<string | null>(null);
  const [installedOllamaModels, setInstalledOllamaModels] = useState<Set<string>>(new Set());
  const [pullingModel, setPullingModel] = useState<string | null>(null);
  const [voiceHint, setVoiceHint] = useState("");
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [runtimeSettingsOpen, setRuntimeSettingsOpen] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);
  /** 当前打开菜单的会话ID */
  const [historyMenuSessionId, setHistoryMenuSessionId] = useState<number | null>(null);
  /** 当前选中的文件夹名称 */
  const [selectedFolderName, setSelectedFolderName] = useState<string>("");
  /** 当前选中的文件列表 */
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  /** 用户点了侧栏「首页」：保持无会话视图，直到新建/发送创建会话 */
  const [homePinned, setHomePinned] = useState(false);
  /** 首次会话列表是否已加载完成（用于避免欢迎屏闪烁） */
  const [sessionsBootstrapped, setSessionsBootstrapped] = useState(false);
  const homePinnedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const sessionsReqRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const modelPickerRef = useRef<HTMLDivElement | null>(null);

  const activeSession = useMemo(() => sessions.find((x) => x.id === activeId) ?? null, [sessions, activeId]);
  const displayModelProfiles = useMemo(() => {
    const seen = new Set<string>();
    const ordered = [...modelProfiles].sort((a, b) => Number(b.is_active) - Number(a.is_active));
    const out: ModelProfile[] = [];
    for (const p of ordered) {
      // Hide profiles that are not configured/ready (e.g., missing API key).
      if (p.is_ready === false) continue;
      // Hide malformed Ollama tags (e.g. names with spaces) from model picker.
      if (isLikelyOllamaProfile(p) && !isValidOllamaModelName(p.model || "")) continue;
      // 强制按“显示模型名”去重，避免同名模型在不同来源/配置下重复显示。
      const display = modelDisplayName(p.model).trim().toLowerCase() || p.model.trim().toLowerCase();
      const key = display;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
    return out;
  }, [modelProfiles]);

  const canOpenRuntimeSettings = Boolean(authedUser && (authedUser.role === "admin" || backendConfig?.auth_disabled));

  /** 仅展示模型 ID（与参考图「Auto」一致：不显示档案名） */
  const composerModelTriggerLabel = useMemo(() => {
    if (!authedUser) return "Auto";
    // Avoid first-frame flicker to backend default model (e.g. gpt-4.1-mini)
    // before user model profiles are loaded.
    if (modelProfiles.length === 0 && !modelLoadError) return "加载中";
    const active = modelProfiles.find((p) => p.id === activeProfileId) ?? modelProfiles.find((p) => p.is_active);
    const m = active?.model?.trim() || backendConfig?.model?.trim();
    return modelDisplayName(m) || "Auto";
  }, [authedUser, modelProfiles, activeProfileId, backendConfig, modelLoadError]);

  useEffect(() => {
    let raf1 = 0;
    let raf2 = 0;
    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        document.documentElement.classList.remove("app-booting");
      });
    });
    return () => {
      if (raf1) window.cancelAnimationFrame(raf1);
      if (raf2) window.cancelAnimationFrame(raf2);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchBackendConfig()
      .then((cfg) => {
        if (cancelled) return;
        setBackendConfig(cfg);
        setBackendOk(true);
        if (cfg.auth_disabled) {
          setAuthedUser({ email: "admin@local", name: "Local Admin", role: "admin" });
          setAuthLoading(false);
          return;
        }
        // 不自动使用 localStorage 中的 token，每次打开页面都需要重新登录
        setAuthLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setBackendOk(false);
        setAuthLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!authedUser) {
      homePinnedRef.current = false;
      setHomePinned(false);
      setSessionsBootstrapped(false);
      return;
    }
    setSessionsBootstrapped(false);
    const reqId = ++sessionsReqRef.current;
    listChatSessions()
      .then((rows) => {
        if (reqId !== sessionsReqRef.current) return;
        const mapped = rows.map((r) => ({ id: r.id, title: r.title, updated_at: r.updated_at }));
        setSessions(mapped);
        if (mapped.length === 0) {
          setActiveId(null);
          return;
        }
        if (homePinnedRef.current) {
          setActiveId(null);
          return;
        }
        setActiveId((prev) => (prev != null ? prev : mapped[0].id));
      })
      .catch(() => {})
      .finally(() => {
        if (reqId === sessionsReqRef.current) {
          setSessionsBootstrapped(true);
        }
      });
  }, [authedUser]);

  useEffect(() => {
    if (!authedUser) return;
    listModelProfiles()
      .then((profiles) => {
        setModelProfiles(profiles);
        const active = profiles.find((p) => p.is_active) ?? null;
        setActiveProfileId(active ? active.id : null);
        setModelLoadError(null);
      })
      .catch((e: any) => {
        setModelProfiles([]);
        setActiveProfileId(null);
        setModelLoadError(String(e?.message ?? e));
      });
  }, [authedUser]);

  useEffect(() => {
    if (!authedUser || !activeId) return;
    listChatMessages(activeId)
      .then((rows) => {
        const msgs = rows
          .filter((m) => m.role !== "tool" && m.role !== "system")
          .map((m) => ({
            id: String(m.id),
            role: m.role as any,
            content: m.content,
            createdAt: m.created_at,
            sessionId: activeId
          }));
        setMessages(msgs);
        setSessionMessages((prev) => ({ ...prev, [activeId]: msgs }));
      })
      .catch(() => {
        setMessages([]);
      });
  }, [authedUser, activeId]);

  useEffect(() => {
    if (messages.length === 0) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages.length, isStreaming]);

  useEffect(() => {
    if (!settingsMenuOpen) return;
    function onDocMouseDown(e: MouseEvent) {
      const el = settingsMenuRef.current;
      if (!el || el.contains(e.target as Node)) return;
      setSettingsMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [settingsMenuOpen]);

  useEffect(() => {
    if (!settingsMenuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSettingsMenuOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [settingsMenuOpen]);

  useEffect(() => {
    if (!modelPickerOpen) return;
    function onDocMouseDown(e: MouseEvent) {
      const el = modelPickerRef.current;
      if (!el || el.contains(e.target as Node)) return;
      setModelPickerOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [modelPickerOpen]);

  useEffect(() => {
    if (!modelPickerOpen || !authedUser) return;
    listOllamaModels()
      .then((names) => {
        setInstalledOllamaModels(new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean)));
      })
      .catch(() => {
        // keep previous cache when ollama is unreachable
      });
  }, [modelPickerOpen, authedUser]);

  useEffect(() => {
    if (!modelPickerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setModelPickerOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modelPickerOpen]);

  useEffect(() => {
    // 打开历史记录面板时，加载所有会话的最新消息用于预览
    if (!historyPanelOpen) return;
    if (!authedUser || sessions.length === 0) return;
    // 找出还没有缓存消息的会话
    const missing = sessions.filter((s) => !sessionMessages[s.id]);
    if (missing.length === 0) return;
    // 并行加载缺失会话的最新消息
    missing.forEach((s) => {
      listChatMessages(s.id)
        .then((rows) => {
          const msgs = rows
            .filter((m) => m.role !== "tool" && m.role !== "system")
            .map((m) => ({
              id: String(m.id),
              role: m.role as any,
              content: m.content,
              createdAt: m.created_at,
              sessionId: s.id
            }));
          setSessionMessages((prev) => ({ ...prev, [s.id]: msgs }));
        })
        .catch(() => {});
    });
  }, [historyPanelOpen, authedUser, sessions.length, sessionMessages]);

  /** 关闭历史记录菜单 */
  function closeHistoryMenu() {
    setHistoryMenuSessionId(null);
  }

  /** 删除会话 */
  async function deleteSession(sessionId: number) {
    try {
      await deleteChatSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      setSessionMessages((prev) => {
        const next = { ...prev };
        delete next[sessionId];
        return next;
      });
      if (activeId === sessionId) {
        const remaining = sessions.filter((s) => s.id !== sessionId);
        setActiveId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (e) {
      console.error("Delete session failed:", e);
    }
    closeHistoryMenu();
  }

  /** 重命名会话 */
  async function renameSession(sessionId: number, newTitle: string) {
    try {
      const updated = await updateChatSession(sessionId, { title: newTitle });
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, title: updated.title } : s))
      );
    } catch (e) {
      console.error("Rename session failed:", e);
    }
    closeHistoryMenu();
  }

  async function copyMessageContent(msgId: string, content: string) {
    const text = (content || "").trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMsgId(msgId);
      window.setTimeout(() => {
        setCopiedMsgId((prev) => (prev === msgId ? null : prev));
      }, 1500);
    } catch {
      setVoiceHint("复制失败，请检查剪贴板权限");
      window.setTimeout(() => setVoiceHint(""), 1600);
    }
  }

  async function send() {
    const text = query.trim();
    if (!text) return;
    if (isStreaming) return;

    let targetSession = activeSession;
    if (!targetSession) {
      homePinnedRef.current = false;
      setHomePinned(false);
      const s = await createChatSession({ title: "New chat", system_prompt: DEFAULT_SYSTEM_PROMPT });
      const created = { id: s.id, title: s.title, updated_at: s.updated_at };
      setSessions((prev) => [created, ...prev]);
      setActiveId(s.id);
      targetSession = created;
    }

    const userMsg: UiMsg = { id: newId("m"), role: "user", content: text, createdAt: Date.now(), sessionId: activeId ?? undefined };
    const assistantMsg: UiMsg = { id: newId("m"), role: "assistant", content: "", createdAt: Date.now(), sessionId: activeId ?? undefined };

    setQuery("");
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setSessionMessages((prev) => {
      const currentMsgs = prev[activeId ?? 0] || [];
      return { ...prev, [activeId ?? 0]: [...currentMsgs, userMsg, assistantMsg] };
    });

    try {
      const filesToSend = selectedFiles;
      await streamChatToSession({
        sessionId: targetSession.id,
        user_message: text,
        files: filesToSend ?? undefined,
        signal: controller.signal,
        onEvent: (evt) => {
          if (evt.type === "meta") {
            // Keep UI model label stable: do not overwrite user's selected profile
            // with transient backend meta (e.g. fallback model during streaming).
            setBackendConfig((prev) => {
              const active = modelProfiles.find((p) => p.id === activeProfileId) ?? modelProfiles.find((p) => p.is_active);
              const preferredModel = active?.model?.trim() || prev?.model || evt.data.model;
              return { provider: evt.data.provider, model: preferredModel, auth_disabled: prev?.auth_disabled };
            });
            setBackendOk(true);
            return;
          }
          if (evt.type === "delta") {
            const delta = evt.data.text ?? "";
            if (!delta) return;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: m.content + delta } : m))
            );
            return;
          }
          if (evt.type === "error") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsg.id
                  ? { ...m, content: (m.content ? m.content + "\n\n" : "") + `Error: ${evt.data.message}` }
                  : m
              )
            );
          }
        }
      });
    } catch (e: any) {
      setBackendOk(false);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? { ...m, content: (m.content ? m.content + "\n\n" : "") + `Error: ${String(e?.message ?? e)}` }
            : m
        )
      );
    } finally {
      setSelectedFiles(null);
      setSelectedFolderName("");
      setIsStreaming(false);
      abortRef.current = null;
      textareaRef.current?.focus();
      try {
        const rows = await listChatSessions();
        setSessions(rows.map((r) => ({ id: r.id, title: r.title, updated_at: r.updated_at })));
        const msgs = await listChatMessages(targetSession.id);
        setMessages(
          msgs
            .filter((m) => m.role !== "tool" && m.role !== "system")
            .map((m) => ({ id: String(m.id), role: m.role as any, content: m.content, createdAt: m.created_at }))
        );
      } catch {}
    }
  }

  const showWelcome = sessionsBootstrapped && activeId === null && messages.length === 0;
  const isHomeNavActive = activeId === null && (homePinned || sessions.length === 0);

  async function createSession() {
    if (!authedUser) return;
    homePinnedRef.current = false;
    setHomePinned(false);
    try {
      const s = await createChatSession({ title: "New chat", system_prompt: DEFAULT_SYSTEM_PROMPT });
      setSessions((prev) => [{ id: s.id, title: s.title, updated_at: s.updated_at }, ...prev]);
      setActiveId(s.id);
      setMessages([]);
    } catch {
      // 创建失败时保留当前界面；可稍后接入 toast
    }
  }

  async function switchModel(profileId: number) {
    if (!profileId || modelSwitching) return;
    try {
      setModelSwitching(true);
      await activateModelProfile(profileId);
      const selected = modelProfiles.find((p) => p.id === profileId);
      if (selected) {
        setBackendConfig((prev) => ({ provider: selected.provider, model: selected.model, auth_disabled: prev?.auth_disabled }));
      }
      setActiveProfileId(profileId);
      setBackendOk(true);
    } catch {
      // keep previous model when switch fails
    } finally {
      setModelSwitching(false);
    }
  }

  function normalizeModelTag(model: string): string {
    const m = (model || "").trim().toLowerCase();
    if (!m) return "";
    return m.includes(":") ? m : `${m}:latest`;
  }

  function isLikelyOllamaProfile(p: ModelProfile): boolean {
    const base = (p.base_url || "").toLowerCase();
    return p.provider === "openai_compat" && (base.includes("11434") || base.includes("ollama"));
  }

  function isValidOllamaModelName(model: string): boolean {
    const m = (model || "").trim();
    if (!m) return false;
    // Ollama tag format examples: llama3.1, qwen2.5:7b, deepseek-r1:latest
    // Keep this permissive but disallow spaces/non-tag separators.
    return !/\s/.test(m) && /^[a-zA-Z0-9._:/-]+$/.test(m);
  }

  function buildOllamaPullCandidates(model: string): string[] {
    const m = (model || "").trim();
    if (!m) return [];
    if (m.includes(":")) return [m];
    // Library entries often omit tag; try default/local and cloud variants.
    return [m, `${m}:latest`, `${m}:cloud`];
  }

  function ollamaModelFamily(model: string): string {
    const m = (model || "").trim().toLowerCase();
    if (!m) return "";
    const base = m.split(":")[0] || m;
    return base;
  }

  function isOllamaUnauthorizedError(e: any): boolean {
    const text = `${String(e?.message ?? "")} ${String(e?.body ?? "")}`.toLowerCase();
    return text.includes("unauthorized") || text.includes("signin") || text.includes("sign in");
  }

  async function pullOllamaModelSmart(model: string): Promise<string> {
    const candidates = buildOllamaPullCandidates(model);
    let lastError: any = null;
    for (const candidate of candidates) {
      try {
        await pullOllamaModel(candidate);
        return candidate;
      } catch (e: any) {
        lastError = e;
        // If auth is required for cloud model, fail fast with clear message.
        if (isOllamaUnauthorizedError(e)) throw e;
      }
    }
    throw lastError ?? new Error("Pull model failed");
  }

  async function pullModelForProfile(p: ModelProfile) {
    const modelName = (p.model || "").trim();
    if (!modelName || pullingModel) return;
    const shouldOpenKeySettings = !isLikelyOllamaProfile(p) || !isValidOllamaModelName(modelName);
    if (shouldOpenKeySettings) {
      setModelPickerOpen(false);
      if (canOpenRuntimeSettings) {
        setRuntimeSettingsOpen(true);
        setVoiceHint("请先在“连接与模型”里配置 API Key");
      } else {
        setVoiceHint("当前账号无权限修改 API Key，请联系管理员");
      }
      window.setTimeout(() => setVoiceHint(""), 1800);
      return;
    }
    try {
      setPullingModel(modelName);
      const pulledTag = await pullOllamaModelSmart(modelName);
      setInstalledOllamaModels((prev) => {
        const next = new Set(prev);
        next.add(normalizeModelTag(pulledTag));
        return next;
      });
      setVoiceHint(`已下载 ${modelDisplayName(pulledTag) || pulledTag}`);
      window.setTimeout(() => setVoiceHint(""), 1300);
    } catch (e: any) {
      const status = Number(e?.status ?? 0);
      const body = String(e?.body ?? "");
      const msg = String(e?.message ?? e);
      if (isOllamaUnauthorizedError(e)) {
        setVoiceHint("该模型需要 Ollama 云端权限，请先执行 ollama signin");
        window.setTimeout(() => setVoiceHint(""), 2200);
        return;
      }
      const notFoundish =
        status === 400 ||
        status === 404 ||
        body.toLowerCase().includes("not found") ||
        body.toLowerCase().includes("model") && body.toLowerCase().includes("not") && body.toLowerCase().includes("found");

      if (notFoundish) {
        // If Ollama can't pull it, treat it as an API-key model.
        setModelPickerOpen(false);
        if (canOpenRuntimeSettings) {
          setRuntimeSettingsOpen(true);
          setVoiceHint("Ollama 拉取不到该模型，请在“连接与模型”里配置 API Key");
        } else {
          setVoiceHint("Ollama 拉取不到该模型，且当前账号无权限配置 Key");
        }
        window.setTimeout(() => setVoiceHint(""), 2000);
      } else {
        setVoiceHint(`下载失败：${msg}`);
        window.setTimeout(() => setVoiceHint(""), 1800);
      }
    } finally {
      setPullingModel(null);
    }
  }

  async function addCustomModelFromPicker() {
    if (modelSwitching || pullingModel) return;
    const raw = window.prompt("输入模型名（例如 qwen2.5:7b）", "");
    const model = (raw || "").trim();
    if (!model) return;
    try {
      const normalizedModel = normalizeModelTag(model);
      const looksLikeOllama = isValidOllamaModelName(model);
      let modelToCreate = model;
      const family = ollamaModelFamily(model);
      const inLibrary = !!family && OLLAMA_LIBRARY_MODELS.has(family);
      if (!inLibrary) {
        setModelPickerOpen(false);
        if (canOpenRuntimeSettings) {
          setRuntimeSettingsOpen(true);
          setVoiceHint("不在 Ollama Library 列表，已跳转到“连接与模型”");
        } else {
          setVoiceHint("该模型不在 Ollama Library，且当前账号无权限配置 Key");
        }
        window.setTimeout(() => setVoiceHint(""), 2200);
        return;
      }
      const ollamaNames = await listOllamaModels().catch(() => []);
      const localSet = new Set(ollamaNames.map((n) => n.trim().toLowerCase()).filter(Boolean));
      const hasLocal = !!normalizedModel && localSet.has(normalizedModel.toLowerCase());

      // For valid Ollama-style names, auto-pull when missing locally.
      if (looksLikeOllama && !hasLocal) {
        try {
          setPullingModel(model);
          const pulledTag = await pullOllamaModelSmart(model);
          modelToCreate = pulledTag;
          localSet.add(normalizeModelTag(pulledTag).toLowerCase());
          setInstalledOllamaModels((prev) => {
            const next = new Set(prev);
            next.add(normalizeModelTag(pulledTag));
            return next;
          });
          if (pulledTag.toLowerCase().endsWith(":cloud")) {
            setVoiceHint("该模型是 Ollama 云模型，使用前请先执行 ollama signin");
            window.setTimeout(() => setVoiceHint(""), 2200);
          }
        } catch (e: any) {
          if (isOllamaUnauthorizedError(e)) {
            setVoiceHint("该模型需要 Ollama 云端权限，请先执行 ollama signin");
            window.setTimeout(() => setVoiceHint(""), 2200);
            return;
          }
          const status = Number(e?.status ?? 0);
          const body = String(e?.body ?? "").toLowerCase();
          const msg = String(e?.message ?? e);
          const notFoundish =
            status === 400 ||
            status === 404 ||
            body.includes("not found") ||
            (body.includes("model") && body.includes("not") && body.includes("found"));
          if (notFoundish) {
            setModelPickerOpen(false);
            if (canOpenRuntimeSettings) {
              setRuntimeSettingsOpen(true);
              setVoiceHint("Ollama 拉取不到该模型，请在“连接与模型”里配置 API Key");
            } else {
              setVoiceHint("Ollama 拉取不到该模型，且当前账号无权限配置 Key");
            }
          } else {
            setVoiceHint(`拉取模型失败：${msg}`);
          }
          window.setTimeout(() => setVoiceHint(""), 2200);
          return;
        }
      } else if (!looksLikeOllama) {
        setModelPickerOpen(false);
        if (canOpenRuntimeSettings) {
          setRuntimeSettingsOpen(true);
          setVoiceHint("该模型名不像 Ollama 格式，请在“连接与模型”里配置 API Key");
        } else {
          setVoiceHint("该模型需要 API Key，且当前账号无权限配置 Key");
        }
        window.setTimeout(() => setVoiceHint(""), 2200);
        return;
      } else if (looksLikeOllama && hasLocal) {
        // Prefer exact installed tag when user entered family name only.
        const baseFamily = ollamaModelFamily(model);
        const installedExact = ollamaNames.find((n) => {
          const t = (n || "").trim().toLowerCase();
          return t === normalizedModel.toLowerCase();
        });
        const installedFamilyCloud = ollamaNames.find((n) => {
          const t = (n || "").trim().toLowerCase();
          return t.startsWith(`${baseFamily}:`) && t.endsWith(":cloud");
        });
        const installedFamilyLatest = ollamaNames.find((n) => {
          const t = (n || "").trim().toLowerCase();
          return t.startsWith(`${baseFamily}:`) && t.endsWith(":latest");
        });
        modelToCreate = installedExact || installedFamilyCloud || installedFamilyLatest || model;
      }

      const baseFromExisting =
        modelProfiles.find((p) => isLikelyOllamaProfile(p))?.base_url?.trim() || "http://127.0.0.1:11434/v1";
      const cleanBase = baseFromExisting.endsWith("/v1") ? baseFromExisting : `${baseFromExisting.replace(/\/+$/, "")}/v1`;
      const existing = modelProfiles.find((p) => normalizeModelTag(p.model || "") === normalizedModel);
      if (existing) {
        setVoiceHint(`模型已存在：${modelDisplayName(existing.model) || existing.model}`);
        window.setTimeout(() => setVoiceHint(""), 1500);
        return;
      }
      const created = await createModelProfile({
        name: modelDisplayName(modelToCreate) || modelToCreate,
        provider: "openai_compat",
        base_url: cleanBase,
        api_key: "ollama",
        model: modelToCreate,
        rpm_limit: 0
      });
      await refreshModelProfiles();
      setVoiceHint(`已添加模型 ${modelDisplayName(created.model) || created.model}`);
      window.setTimeout(() => setVoiceHint(""), 1500);
    } catch (e: any) {
      setVoiceHint(`添加失败：${String(e?.message ?? e)}`);
      window.setTimeout(() => setVoiceHint(""), 1800);
    } finally {
      setPullingModel(null);
    }
  }

  async function refreshModelProfiles() {
    if (!authedUser) return;
    try {
      setModelLoadError(null);
      const profiles = await listModelProfiles();
      setModelProfiles(profiles);
      const active = profiles.find((p) => p.is_active) ?? null;
      setActiveProfileId(active ? active.id : null);
    } catch (e: any) {
      setModelLoadError(String(e?.message ?? e));
    }
  }

  function openExternalLink(url: string) {
    window.open(url, "_blank", "noopener,noreferrer");
    setSettingsMenuOpen(false);
  }

  function goHomeBoard() {
    homePinnedRef.current = true;
    setHomePinned(true);
    setActiveId(null);
    setMessages([]);
    setQuery("");
    setRuntimeSettingsOpen(false);
    setModelPickerOpen(false);
    setSettingsMenuOpen(false);
  }

  function onAttachFile() {
    fileInputRef.current?.click();
  }

  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    // If user selected a directory (or browser provides relative path), show folder hint.
    const first = files[0] as any;
    const relativePath: string = first?.webkitRelativePath || "";
    const folderPath = relativePath ? relativePath.split("/")[0] : "";
    setSelectedFolderName(folderPath || "");
    setSelectedFiles(files);
    const names = Array.from(files).map((f) => f.name).join(", ");
    setQuery((prev) => `${prev}${prev ? "\n" : ""}[附件] ${names}`);
    e.target.value = "";
  }

  function onVoiceInput() {
    textareaRef.current?.focus();
    setVoiceHint("请按 Win+H 使用系统语音输入");
    setTimeout(() => setVoiceHint(""), 3000);
  }

  // 认证加载中，显示加载状态
    if (authLoading) {
      return (
        <div className="authLoading">
          <img src={pandaIcon} alt="CoPaw" className="authLoadingIcon" />
          <span className="authLoadingText">加载中...</span>
        </div>
      );
    }
    // 如果未登录且需要认证，显示独立登录页面
    if (!authedUser && !backendConfig?.auth_disabled) {
      return (
        <LoginPage
          onAuthed={async () => {
            const u = await me();
            setAuthedUser({ email: u.email, name: u.name, role: u.role });
            const cfg = await fetchBackendConfig();
            setBackendConfig(cfg);
            setBackendOk(true);
            const rows = await listChatSessions();
            setSessions(rows.map((r) => ({ id: r.id, title: r.title, updated_at: r.updated_at })));
          }}
        />
      );
    }

    return (
      <div className={`desktopRoot${sidebarCollapsed ? " desktopRoot--sidebarCollapsed" : ""}`}>
        {!sidebarCollapsed ? (
        <aside className="leftRail mockSidebar copawSidebar copawSidebar--v2">
          <div className="sidebarBrandRow">
            <button type="button" className="sidebarAvatarButton" onClick={createSession} title="新建对话" aria-label="新建对话">
              <img className="sidebarAvatarImage" src={pandaIcon} alt="" />
            </button>
            <div className="sidebarBrandText">
              <div className="sidebarBrandName">CoPaw</div>
              <div className="sidebarBrandSub">模型与对话</div>
            </div>
          </div>

        <nav className="sidebarV2Nav" aria-label="主导航">
          <button
            type="button"
            className={`sidebarV2NavItem${isHomeNavActive ? " sidebarV2NavItem--active" : ""}`}
            onClick={goHomeBoard}
            aria-current={isHomeNavActive ? "page" : undefined}
          >
            <span className="sidebarV2NavGlyphWrap" aria-hidden="true">
              <svg viewBox="0 0 20 20" className="sidebarV2NavGlyph">
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.55"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.5 8.2 10 3.2l6.5 5V16a.75.75 0 0 1-.75.75H13V10.5H7V16.75H4.25A.75.75 0 0 1 3.5 16V8.2z"
                />
              </svg>
            </span>
            <span>首页</span>
          </button>
          {canOpenRuntimeSettings ? (
            <button
              type="button"
              className="sidebarV2NavItem"
              onClick={() => setRuntimeSettingsOpen(true)}
            >
              <span className="sidebarV2NavGlyphWrap" aria-hidden="true">
                <svg viewBox="0 0 20 20" className="sidebarV2NavGlyph">
                  <path
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M7.5 12.5 5 10l1.5-1.5a3 3 0 0 1 4.24-4.24L12 5.5 10.5 7l-1.5 1.5a1 1 0 0 1-1.42-1.42L9 5.66a3 3 0 0 1 4.24 4.24L12 8.5l1.5-1.5 1.5 1.5-1.5 1.5a3 3 0 0 1-4.24 4.24L7.5 12.5Z"
                  />
                </svg>
              </span>
              <span>连接</span>
            </button>
          ) : null}
          <button
            type="button"
            className={`sidebarV2NavItem${historyPanelOpen ? " sidebarV2NavItem--active" : ""}`}
            onClick={() => setHistoryPanelOpen((v) => !v)}
          >
            <span className="sidebarV2NavGlyphWrap" aria-hidden="true">
              <svg viewBox="0 0 20 20" className="sidebarV2NavGlyph">
                <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <path d="M10 6v4l3 2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span>历史记录</span>
          </button>
        </nav>
        {historyPanelOpen ? (
          <div className="historyPanel">
            <div className="historyPanelHeader" />
            <div className="historyPanelList">
              {(() => {
                // 每个会话只取最后一条消息
                type SessionLastMsg = { session: { id: number; title: string; updated_at: number }; msg: UiMsg };
                const sessionLastMsgs = sessions
                  .map((s) => {
                    const msgs = sessionMessages[s.id] || [];
                    const lastMsg = msgs.filter((m) => m.role === "user").pop();
                    return lastMsg ? { session: s, msg: lastMsg } : null;
                  })
                  .filter((v): v is SessionLastMsg => v !== null)
                  .sort((a, b) => b.msg.createdAt - a.msg.createdAt);
                if (sessionLastMsgs.length === 0) {
                  return <div className="historyPanelEmpty">暂无历史记录</div>;
                }
                return sessionLastMsgs.map(({ session, msg }) => (
                  <div key={session.id} className="historyPanelItem">
                    <button
                      type="button"
                      className="historyPanelItemMain"
                      onClick={() => {
                        setHistoryPanelOpen(false);
                        if (session.id !== activeId) {
                          setActiveId(session.id);
                        }
                      }}
                    >
                      <span className="historyPanelItemSession">{session.title || "会话"}</span>
                      <span className="historyPanelItemText">{msg.content.slice(0, 50)}{msg.content.length > 50 ? "..." : ""}</span>
                      <span className="historyPanelItemTime">
                        {new Date(msg.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </button>
                    <div style={{ position: "relative" }}>
                      <button
                        type="button"
                        className="historyPanelItemMore"
                        title="更多选项"
                        onClick={(e) => {
                          e.stopPropagation();
                          setHistoryMenuSessionId(historyMenuSessionId === session.id ? null : session.id);
                        }}
                      >
                        <svg viewBox="0 0 16 16" width="14" height="14">
                          <circle cx="3" cy="8" r="1.5" fill="currentColor" />
                          <circle cx="8" cy="8" r="1.5" fill="currentColor" />
                          <circle cx="13" cy="8" r="1.5" fill="currentColor" />
                        </svg>
                      </button>
                      {historyMenuSessionId === session.id && (
                        <div className="historyPanelMenu">
                          <button
                            type="button"
                            className="historyPanelMenuItem"
                            onClick={(e) => {
                              e.stopPropagation();
                              const newTitle = prompt("请输入新名称：", session.title || "会话");
                              if (newTitle && newTitle !== session.title) {
                                renameSession(session.id, newTitle);
                              } else {
                                closeHistoryMenu();
                              }
                            }}
                          >
                            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11.5 2.5a1.5 1.5 0 0 1 2.12 2.12L5.5 13l-2.5.5.5-2.5 8.12-8.12z" />
                            </svg>
                            重命名
                          </button>
                          <button
                            type="button"
                            className="historyPanelMenuItem historyPanelMenuItemDanger"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`确定删除「${session.title || "会话"}」？`)) {
                                deleteSession(session.id);
                              } else {
                                closeHistoryMenu();
                              }
                            }}
                          >
                            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M2.5 4.5h11M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M12 4.5v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8" />
                            </svg>
                            删除
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        ) : null}
      </aside>
      ) : null}

      <main className="mainDesk cleanMain">
        <header className="topBar">
          <div className="topLeft">
            <button
              type="button"
              className="iconBtn sidebarPanelToggle"
              onClick={() => setSidebarCollapsed((c) => !c)}
              title={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
              aria-label={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
            >
              {sidebarCollapsed ? <SidebarExpandIcon /> : <SidebarCollapseIcon />}
            </button>
          </div>
          <div className="topActions">
            <div className="settingsMenuAnchor" ref={settingsMenuRef}>
              <button
                type="button"
                className={`iconBtn ${settingsMenuOpen ? "iconBtnActive" : ""}`}
                onClick={() => {
                  setModelPickerOpen(false);
                  setSettingsMenuOpen((o) => !o);
                }}
                title="设置"
                aria-label="设置菜单"
                aria-expanded={settingsMenuOpen}
                aria-haspopup="menu"
              >
                <GearIcon />
              </button>
              {settingsMenuOpen ? (
                <div className="settingsDropdown" role="menu">
                  <div className="settingsDropdownSection">
                    <div className="settingsDropdownLabel">Ollama</div>
                    <button
                      type="button"
                      role="menuitem"
                      className="settingsDropdownItem"
                      onClick={() => openExternalLink("https://ollama.com/search")}
                    >
                      <span className="settingsDropdownItemLabel">模型搜索</span>
                      <span className="settingsDropdownMeta">ollama.com</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="settingsDropdownItem"
                      onClick={() => openExternalLink("https://ollama.com/library")}
                    >
                      <span className="settingsDropdownItemLabel">模型库</span>
                      <span className="settingsDropdownMeta">library</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="settingsDropdownItem"
                      onClick={() => openExternalLink("https://ollama.com/download")}
                    >
                      <span className="settingsDropdownItemLabel">下载客户端</span>
                      <span className="settingsDropdownMeta">download</span>
                    </button>
                  </div>
                  {authedUser ? (
                    <>
                      <div className="settingsDropdownSep" aria-hidden="true" />
                      <div className="settingsDropdownSection">
                        <button
                          type="button"
                          role="menuitem"
                          className="settingsDropdownItem"
                          disabled={modelSwitching}
                          onClick={() => {
                            setSettingsMenuOpen(false);
                            void refreshModelProfiles();
                          }}
                        >
                          <span className="settingsDropdownItemLabel">刷新模型列表</span>
                          <span className="settingsDropdownMeta">同步档案</span>
                        </button>
                      </div>
                    </>
                  ) : null}
                  {authedUser && (authedUser.role === "admin" || backendConfig?.auth_disabled) ? (
                    <>
                      <div className="settingsDropdownSep" aria-hidden="true" />
                      <div className="settingsDropdownSection settingsDropdownSection--tail">
                        <button
                          type="button"
                          role="menuitem"
                          className="settingsDropdownItem"
                          onClick={() => {
                            setSettingsMenuOpen(false);
                            setRuntimeSettingsOpen(true);
                          }}
                        >
                          <span className="settingsDropdownItemLabel">连接与模型</span>
                        </button>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <section className="chatBoard">
          <div className={`chatViewport cleanViewport ${showWelcome ? "cleanViewportWelcome" : ""}`}>
            {showWelcome ? (
              <div className="welcomeBox">
                <img className="welcomeMascot" src={pandaIcon} alt="" />
                <h3>What can I help with?</h3>
                <p>Start a fresh chat or jump into the Ollama model library.</p>
                <div className="welcomeActions">
                  <button
                    type="button"
                    className="welcomeBtn"
                    disabled={!authedUser}
                    onClick={() => void createSession()}
                  >
                    <span>New chat</span>
                    <svg viewBox="0 0 16 16" className="welcomeBtnChevron" aria-hidden="true">
                      <path
                        d="M6 3.5 10.5 8 6 12.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="welcomeBtn"
                    onClick={() => openExternalLink("https://ollama.com/library")}
                  >
                    <span>Ollama model library</span>
                    <svg viewBox="0 0 16 16" className="welcomeBtnChevron" aria-hidden="true">
                      <path
                        d="M6 3.5 10.5 8 6 12.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            ) : (
              <div className="chatStreamColumn">
                {messages.map((m) => (
                  <div key={m.id} id={`msg-${m.id}`} className={`msgRow ${m.role === "user" ? "msgRowUser" : ""}`}>
                    <div
                      className={`msgBubble ${
                        m.role === "user"
                          ? "msgUser"
                          : `msgAssistant${!m.content.trim() ? " msgAssistantPending" : ""}`
                      }`}
                    >
                      {m.role === "assistant" && m.content.trim() ? (
                        <button
                          type="button"
                          className="msgCopyBtn"
                          onClick={() => void copyMessageContent(m.id, m.content)}
                          title={copiedMsgId === m.id ? "已复制" : "复制内容"}
                          aria-label={copiedMsgId === m.id ? "已复制" : "复制内容"}
                        >
                          {copiedMsgId === m.id ? (
                            <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
                              <path
                                d="M5 10.3 8.2 13.5 15 6.7"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.9"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
                              <rect x="7.2" y="5.8" width="8.5" height="10.1" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.6" />
                              <path d="M5.2 13.3V4.9a1.6 1.6 0 0 1 1.6-1.6h6.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                            </svg>
                          )}
                        </button>
                      ) : null}
                      {m.role === "assistant" && !m.content.trim() ? (
                        <span className="typingDots" aria-label="生成中">
                          <span />
                          <span />
                          <span />
                        </span>
                      ) : (
                        m.content
                      )}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <div className="composerWrap cleanComposerWrap">
            <div className="composerBar">
              <input ref={fileInputRef} type="file" multiple hidden onChange={onFilePicked} onClick={(e) => {
                const target = e.target as HTMLInputElement;
                target.setAttribute('webkitdirectory', '');
              }} />
              <textarea
                ref={textareaRef}
                placeholder=""
                value={query}
                maxLength={10000}
                disabled={!authedUser}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  if (e.shiftKey) return;
                  if (e.nativeEvent.isComposing) return;
                  e.preventDefault();
                  void send();
                }}
              />
              <div className="composerBottomBar">
                <div className="composerTools" aria-label="Input tools">
                  <button
                    className="composerToolBtn"
                    type="button"
                    title="Voice input"
                    aria-label="Voice input"
                    onClick={onVoiceInput}
                  >
                    <svg viewBox="0 0 20 20" className="composerToolIcon" aria-hidden="true">
                      <rect x="7" y="3" width="6" height="10" rx="3" />
                      <path d="M5 9.8a5 5 0 0 0 10 0" />
                      <path d="M10 15v3" />
                      <path d="M7.5 18h5" />
                    </svg>
                  </button>
                  <button
                    className="composerToolBtn"
                    type="button"
                    title="附件"
                    aria-label="附件"
                    onClick={onAttachFile}
                  >
                    <svg viewBox="0 0 20 20" className="composerToolIcon" aria-hidden="true">
                      <path d="M2.5 6.5a2 2 0 0 1 2-2h3l1.4 1.7h6.6a2 2 0 0 1 2 2v5.8a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2V6.5Z" />
                    </svg>
                  </button>
                  {selectedFolderName ? (
                    <span className="selectedFolderTag" title={selectedFolderName}>{selectedFolderName}</span>
                  ) : null}
                </div>
                <div className="composerBottomRight">
                  <div className="composerModelPicker" ref={modelPickerRef}>
                    <button
                      type="button"
                      className={`composerModelBtn${modelPickerOpen ? " composerModelBtnActive" : ""}`}
                      aria-expanded={modelPickerOpen}
                      aria-haspopup="listbox"
                      title="选择模型（仅显示模型名）"
                      disabled={!authedUser || isStreaming}
                      onClick={() => {
                        setSettingsMenuOpen(false);
                        if (!authedUser) return;
                        if (displayModelProfiles.length === 0) {
                          if (canOpenRuntimeSettings) setRuntimeSettingsOpen(true);
                          return;
                        }
                        setModelPickerOpen((o) => !o);
                      }}
                    >
                      <span className="composerModelBtnLabel">{composerModelTriggerLabel}</span>
                      <svg className="composerModelBtnChevron" viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
                        <path
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 8l4 4 4-4"
                        />
                      </svg>
                    </button>
                    {modelPickerOpen && displayModelProfiles.length > 0 ? (
                      <div className="composerModelMenu" role="listbox" aria-label="选择模型">
                        {displayModelProfiles.map((p) => {
                          const norm = normalizeModelTag(p.model);
                          const installed = !!norm && installedOllamaModels.has(norm);
                          const isOllamaProfile = isLikelyOllamaProfile(p);
                          const validOllamaName = isValidOllamaModelName(p.model || "");
                          const needsPull = isOllamaProfile && validOllamaName && !installed;
                          const needsKey = !isOllamaProfile && p.is_ready === false;
                          const showDownload = needsPull || needsKey;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              role="option"
                              aria-selected={p.id === activeProfileId}
                              aria-label={`${modelDisplayName(p.model) || p.model}（档案 ${p.name}）`}
                              className={`composerModelMenuRow${p.id === activeProfileId ? " composerModelMenuRow--active" : ""}`}
                              disabled={modelSwitching}
                              onClick={() => {
                                void switchModel(p.id).then(() => setModelPickerOpen(false));
                              }}
                            >
                              <span className="composerModelMenuTitle">{modelDisplayName(p.model) || p.model}</span>
                              {showDownload ? (
                                <span
                                  className="composerModelDownload"
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    void pullModelForProfile(p);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key !== "Enter" && e.key !== " ") return;
                                    e.preventDefault();
                                    e.stopPropagation();
                                    void pullModelForProfile(p);
                                  }}
                                  aria-label={`下载模型 ${p.model}`}
                                >
                                  {needsPull ? (pullingModel === p.model ? "下载中…" : "下载") : "配置Key"}
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          className="composerModelMenuAdd"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void addCustomModelFromPicker();
                          }}
                        >
                          Add Models
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className={`sendBtn${isStreaming ? " sendBtnStreaming" : ""}`}
                    title={isStreaming ? "停止生成" : "发送"}
                    aria-label={isStreaming ? "停止生成" : "发送"}
                    disabled={!authedUser}
                    onClick={() => {
                      if (isStreaming) {
                        abortRef.current?.abort();
                        return;
                      }
                      void send();
                    }}
                  >
                    {isStreaming ? (
                      <svg viewBox="0 0 20 20" className="sendBtnGlyph" width="20" height="20" aria-hidden="true">
                        <rect x="6.6" y="6.6" width="6.8" height="6.8" rx="1.2" fill="currentColor" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 20 20" className="sendBtnGlyph" width="20" height="20" aria-hidden="true">
                        <path
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.85"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M10 14.5V5.5M6.35 9.15L10 5.5l3.65 3.65"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
          {voiceHint ? (
            <div className="voiceToast" role="status" aria-live="polite">
              <span>{voiceHint}</span>
            </div>
          ) : null}
        </section>
      </main>
      <div className="rightDivider" />

      

      {runtimeSettingsOpen ? (
        <RuntimeSettingsModal
          open={runtimeSettingsOpen}
          onClose={() => setRuntimeSettingsOpen(false)}
          onSaved={async () => {
            try {
              const profiles = await listModelProfiles();
              setModelProfiles(profiles);
              const active = profiles.find((p) => p.is_active) ?? null;
              setActiveProfileId(active ? active.id : null);
              setModelLoadError(null);
              const cfg = await fetchBackendConfig();
              setBackendConfig(cfg);
            } catch (e: any) {
              setModelLoadError(String(e?.message ?? e));
            }
          }}
        />
      ) : null}
    </div>
  );
}

