import { useState } from "react";

const CONSENT_KEY = "cookieConsent";

function hasConsent(): boolean {
  try { return localStorage.getItem(CONSENT_KEY) === "true"; }
  catch { return false; }
}

function saveConsent(): void {
  try { localStorage.setItem(CONSENT_KEY, "true"); }
  catch { /* приватный режим/заблокирован localStorage — не роняем UI */ }
}

export function CookieBanner() {
  const [visible, setVisible] = useState(() => !hasConsent());
  if (!visible) return null;
  const accept = () => { saveConsent(); setVisible(false); };
  return (
    <div className="xtz-cookie" role="region" aria-label="Согласие на cookie">
      <div className="xtz-cookie-card">
        <div className="xtz-cookie-text">
          <b className="xtz-cookie-title">Мы используем cookie</b>
          <span className="xtz-cookie-body">Мы используем cookie для корректной работы сайта и сохранения настроек пользователя.</span>
        </div>
        <button type="button" className="xtz-cookie-accept" onClick={accept}>Принять</button>
      </div>
    </div>
  );
}
