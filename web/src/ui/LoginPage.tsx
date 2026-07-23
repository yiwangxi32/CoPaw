import React, { useState, useEffect, useRef } from "react";
import { login } from "../lib/api";
import { saveToken } from "../lib/auth";
import pandaIcon from "./copaw-icon.svg";

export function LoginPage(props: { onAuthed: () => void }) {
  const [email, setEmail] = useState("admin@local");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  async function submit() {
    setErr(null);
    setBusy(true);
    try {
      const res = await login(email.trim(), password);
      saveToken(res.access_token);
      props.onAuthed();
    } catch (e: any) {
      const errorMsg = String(e?.message ?? e);
      setErr(errorMsg);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(() => {
        setErr(null);
        timeoutRef.current = null;
      }, 5000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="loginPage">
      <div className="loginCard">
        <div className="loginCardLogo">
          <img src={pandaIcon} alt="CoPaw" className="loginCardLogoImage" />
        </div>
        <div className="loginCardHeader">
          <h2>登录 CoPaw</h2>
        </div>
        <div className="loginForm">
          <div className="loginField">
            <label className="loginFieldLabel">邮箱</label>
            <input
              className="loginFieldInput"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setErr(null);
              }}
              placeholder="admin@local"
              autoFocus
            />
          </div>
          <div className="loginField">
            <label className="loginFieldLabel">密码</label>
            <input
              className="loginFieldInput"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setErr(null);
              }}
              placeholder="请输入密码"
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
          </div>
        </div>

        {err ? (
          <div className="loginError">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <span>{err}</span>
          </div>
        ) : (
          <div className="loginHelp">
            初始账号: admin@local / change-me-now
          </div>
        )}

        <button className="loginSubmitBtn" disabled={busy} onClick={submit}>
          {busy ? (
            <span className="loginBtnSpinner">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
                <circle className="loginBtnSpinnerCircle" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
              </svg>
            </span>
          ) : null}
          {busy ? "登录中..." : "登 录"}
        </button>
      </div>
    </div>
  );
}
