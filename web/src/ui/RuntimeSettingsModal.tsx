import React, { useEffect, useState } from "react";
import { createModelProfile, fetchRuntimeSettings, RuntimeSettings, updateRuntimeSettings } from "../lib/api";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

export function RuntimeSettingsModal(props: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState("");
  const [hint, setHint] = useState<RuntimeSettings | null>(null);
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState("");
  const [openaiDefaultModel, setOpenaiDefaultModel] = useState("");
  const [openaiApiKeyNew, setOpenaiApiKeyNew] = useState("");
  const [clearOpenaiKey, setClearOpenaiKey] = useState(false);
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState("");
  const [copawPresetModels, setCopawPresetModels] = useState("");
  const [copawOllamaPresets, setCopawOllamaPresets] = useState("");

  const modelRaw = openaiDefaultModel.trim();
  const modelParts = modelRaw ? modelRaw.split(",").map((s) => s.trim()) : [];
  const hasIncompleteModel = modelParts.some((m) => !m);
  const invalidModel = modelParts.find((m) => m && !/^[a-zA-Z0-9._:/-]+$/.test(m));
  const hasNewKey = !!openaiApiKeyNew.trim();
  const hasExistingKey = !!hint?.openai_api_key_set && !clearOpenaiKey;
  const modelNeedsKey = modelParts.filter(Boolean).length > 0 && !hasNewKey && !hasExistingKey;
  const modelInputError = hasIncompleteModel
    ? "添加模型格式不完整，请检查逗号分隔（不要留空项）。"
    : invalidModel
      ? `模型名格式不正确：${invalidModel}`
      : modelNeedsKey
        ? "请先配置 OpenAI API Key，再添加模型。"
        : "";
  const apiKeyLooksInvalid =
    !!openaiApiKeyNew.trim() &&
    (openaiApiKeyNew.trim().length < 10 || !/[a-zA-Z0-9]/.test(openaiApiKeyNew.trim()));
  const apiKeyLooksGithubToken =
    !!openaiApiKeyNew.trim() &&
    /^(github_pat_|ghp_|gho_|ghu_|ghs_|ghr_)/i.test(openaiApiKeyNew.trim());
  const githubBaseLike = /github|models\.inference\.ai\.azure\.com/i.test(openaiBaseUrl.trim());
  const apiKeyFieldError = apiKeyLooksGithubToken && !githubBaseLike
    ? "检测到 GitHub Token。若要使用它，请把 Base URL 改为 GitHub Models 地址（如 https://models.inference.ai.azure.com）。"
    : apiKeyLooksInvalid
      ? "API Key 看起来不完整，请检查后再保存。"
      : "";

  const presetRaw = copawPresetModels.trim();
  const presetParts = presetRaw ? presetRaw.split(",").map((s) => s.trim()) : [];
  const presetHasIncomplete = presetParts.some((m) => !m);
  const presetInvalid = presetParts.find((m) => m && !/^[a-zA-Z0-9._:/-]+$/.test(m));
  const presetFieldError = presetHasIncomplete
    ? "预设模型列表格式不完整，请检查逗号分隔（不要留空项）。"
    : presetInvalid
      ? `预设模型名格式不正确：${presetInvalid}`
      : "";

  useEffect(() => {
    if (!props.open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") props.onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [props.open, props.onClose]);

  useEffect(() => {
    if (!props.open) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    setSuccess("");
    fetchRuntimeSettings()
      .then((d) => {
        if (cancelled) return;
        setHint(d);
        setOpenaiBaseUrl(d.openai_base_url);
        setOpenaiDefaultModel("");
        setOpenaiApiKeyNew("");
        setClearOpenaiKey(false);
        setOllamaBaseUrl(d.ollama_base_url);
        setCopawPresetModels(d.copaw_preset_models);
        setCopawOllamaPresets(d.copaw_ollama_preset_models);
      })
      .catch((e) => {
        if (!cancelled) setErr(String(e?.message ?? e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [props.open]);

  async function onSave() {
    setSaving(true);
    setErr(null);
    setSuccess("");
    try {
      const modelsToAdd = modelParts.filter(Boolean);
      if (modelInputError) {
        setErr(modelInputError);
        return;
      }
      if (apiKeyFieldError) {
        setErr(apiKeyFieldError);
        return;
      }
      if (presetFieldError) {
        setErr(presetFieldError);
        return;
      }

      const body: Parameters<typeof updateRuntimeSettings>[0] = {
        openai_base_url: openaiBaseUrl,
        ollama_base_url: ollamaBaseUrl,
        copaw_preset_models: copawPresetModels,
        copaw_ollama_preset_models: copawOllamaPresets
      };
      if (clearOpenaiKey) {
        body.clear_openai_api_key = true;
      } else if (openaiApiKeyNew.trim()) {
        body.openai_api_key = openaiApiKeyNew.trim();
      }
      const next = await updateRuntimeSettings(body);
      if (modelsToAdd.length > 0) {
        for (const modelToAdd of modelsToAdd) {
          await createModelProfile({
            name: modelToAdd,
            provider: "openai_compat",
            base_url: openaiBaseUrl.trim() || "https://api.openai.com/v1",
            api_key: "runtime",
            model: modelToAdd,
            rpm_limit: 60
          });
        }
        setOpenaiDefaultModel("");
      }
      setHint(next);
      setOpenaiApiKeyNew("");
      setClearOpenaiKey(false);
      props.onSaved?.();
      setSuccess("保存成功");
      window.setTimeout(() => {
        props.onClose();
      }, 650);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  if (!props.open) return null;

  return (
    <div className="modalOverlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="modal runtimeSettingsModal" role="dialog" aria-modal="true" aria-labelledby="runtime-settings-title" onMouseDown={(e) => e.stopPropagation()}>
        <div className="runtimeSettingsHead">
          <h2 id="runtime-settings-title" className="runtimeSettingsTitle">
            连接与模型
          </h2>
          <button type="button" className="runtimeSettingsClose" onClick={props.onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <p className="runtimeSettingsIntro">保存到本地数据库，优先于 <code>backend/.env</code>。留空的文本框在保存时会清除该条覆盖（恢复为环境变量）。</p>

        <div className="runtimeSettingsStatus" aria-live="polite">
          {loading ? <div className="runtimeSettingsMuted">加载中…</div> : null}
          {err ? <div className="runtimeSettingsErr">{err}</div> : null}
          {success ? <div className="runtimeSettingsOk">{success}</div> : null}
        </div>

        {!loading ? (
          <div className="runtimeSettingsForm">
            <label className="runtimeSettingsLabel">OpenAI 兼容 Base URL</label>
            <input
              className="runtimeSettingsInput"
              value={openaiBaseUrl}
              onChange={(e) => setOpenaiBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1 或 https://models.inference.ai.azure.com"
              autoComplete="off"
            />
            <div className="runtimeSettingsQuickUrls">
              <button
                type="button"
                className="runtimeSettingsQuickBtn"
                onClick={() => setOpenaiBaseUrl("https://api.openai.com/v1")}
              >
                使用 OpenAI URL
              </button>
              <button
                type="button"
                className="runtimeSettingsQuickBtn"
                onClick={() => setOpenaiBaseUrl("https://models.inference.ai.azure.com")}
              >
                使用 GitHub Models URL
              </button>
            </div>
            <p className="runtimeSettingsHint">不要填写文档链接，必须填写 API 根地址。</p>

            <label className="runtimeSettingsLabel">添加模型到列表（保存后出现在模型下拉）</label>
            <input
              className={`runtimeSettingsInput${modelInputError ? " runtimeSettingsInputInvalid" : ""}`}
              value={openaiDefaultModel}
              onChange={(e) => setOpenaiDefaultModel(e.target.value)}
              placeholder="例如 claude-3.5-sonnet, gpt-4.1-mini"
              autoComplete="off"
            />
            {modelInputError ? <p className="runtimeSettingsFieldError">{modelInputError}</p> : null}

            <label className="runtimeSettingsLabel">OpenAI API Key</label>
            {hint?.openai_api_key_set ? (
              <p className="runtimeSettingsHint">当前已配置 {hint.openai_api_key_hint || "****"} · 仅在下方填写新密钥才会更新</p>
            ) : (
              <p className="runtimeSettingsHint">未配置（将使用 .env 或未设置）</p>
            )}
            <input
              className={`runtimeSettingsInput${apiKeyFieldError ? " runtimeSettingsInputInvalid" : ""}`}
              type="password"
              value={openaiApiKeyNew}
              onChange={(e) => setOpenaiApiKeyNew(e.target.value)}
              placeholder="新密钥（可选）"
              autoComplete="new-password"
            />
            {apiKeyFieldError ? <p className="runtimeSettingsFieldError">{apiKeyFieldError}</p> : null}
            <label className="runtimeSettingsCheck">
              <input type="checkbox" checked={clearOpenaiKey} onChange={(e) => setClearOpenaiKey(e.target.checked)} />
              清除已保存的密钥（改回仅使用 .env）
            </label>

            <label className="runtimeSettingsLabel">Ollama 根地址</label>
            <input className="runtimeSettingsInput" value={ollamaBaseUrl} onChange={(e) => setOllamaBaseUrl(e.target.value)} placeholder="http://127.0.0.1:11434" autoComplete="off" />

            <label className="runtimeSettingsLabel">OpenAI 预设模型列表（逗号分隔，首次无档案时灌入）</label>
            <input
              className={`runtimeSettingsInput${presetFieldError ? " runtimeSettingsInputInvalid" : ""}`}
              value={copawPresetModels}
              onChange={(e) => setCopawPresetModels(e.target.value)}
              placeholder="留空使用内置默认"
            />
            {presetFieldError ? <p className="runtimeSettingsFieldError">{presetFieldError}</p> : null}

            <label className="runtimeSettingsLabel">Ollama 离线预设（逗号分隔；仅当拉不到 /api/tags 时使用）</label>
            <input className="runtimeSettingsInput" value={copawOllamaPresets} onChange={(e) => setCopawOllamaPresets(e.target.value)} placeholder="如 llama3.2:latest,mistral:latest" />
          </div>
        ) : null}

        <div className="runtimeSettingsActions">
          <button type="button" className="runtimeSettingsBtnSecondary" onClick={props.onClose} disabled={saving}>
            取消
          </button>
          <button
            type="button"
            className="runtimeSettingsBtnPrimary"
            onClick={() => void onSave()}
            disabled={loading || saving || !!modelInputError || !!apiKeyFieldError || !!presetFieldError}
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
