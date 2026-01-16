#!/data/data/com.termux/files/usr/bin/bash
set -e
cd "$(dirname "$0")/docs"

echo "[1/4] Backup app.js"
TS="$(date +%Y%m%d_%H%M%S)"
cp -a app.js "app.js.bak_$TS"

echo "[2/4] Ensure consent key is consistent + cleanup any leftover overlay"
# 1) Inject helper + robust ensureConsent if function exists
#    We replace the whole ensureConsent() body to:
#    - if localStorage consent is set => remove overlay if any, return true
#    - if overlay already exists => return false (already prompting)
#    - else create overlay (visible), bind click to set localStorage and remove overlay

perl -0777 -i -pe '
s/function\s+ensureConsent\s*\(\s*\)\s*\{.*?\n\}/function ensureConsent(){\n  try {\n    const KEY = \"aegis_consent_v1\";\n    const existing = document.getElementById(\"consentOverlay\");\n    const ok = localStorage.getItem(KEY)===\"1\";\n    if(ok){\n      if(existing) existing.remove();\n      document.documentElement.classList.remove(\"modal-open\");\n      return Promise.resolve(true);\n    }\n    if(existing){\n      // already displayed => block navigation until accepted\n      return Promise.resolve(false);\n    }\n\n    // Create a REAL overlay (not transparent), so user sees it\n    const ov = document.createElement(\"div\");\n    ov.id = \"consentOverlay\";\n    ov.style.cssText = \"position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.65);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:18px;\";\n    ov.innerHTML = `\n      <div style=\"max-width:720px;width:100%;border-radius:18px;background:rgba(18,18,18,.92);border:1px solid rgba(255,255,255,.08);box-shadow:0 12px 40px rgba(0,0,0,.55);padding:16px;\">\n        <h2 style=\"margin:0 0 8px 0;\">Avertissement</h2>\n        <div style=\"opacity:.9;line-height:1.35;\">\n          AEGIS est un outil d’hygiène de vie (non médical). En cas de doute, symptômes, grossesse, traitement, pathologie, demande un avis professionnel.\n        </div>\n        <div style=\"display:flex;gap:10px;margin-top:14px;justify-content:flex-end;\">\n          <button id=\"consent_ok\" class=\"btn\">J’ai compris</button>\n        </div>\n      </div>\n    `;\n    document.body.appendChild(ov);\n    document.documentElement.classList.add(\"modal-open\");\n\n    return new Promise((resolve)=>{\n      const b = document.getElementById(\"consent_ok\");\n      if(!b){ resolve(false); return; }\n      b.addEventListener(\"click\", ()=>{\n        localStorage.setItem(KEY,\"1\");\n        const x = document.getElementById(\"consentOverlay\");\n        if(x) x.remove();\n        document.documentElement.classList.remove(\"modal-open\");\n        resolve(true);\n      }, {passive:true});\n    });\n  } catch(e){\n    return Promise.resolve(true);\n  }\n}\n/sms' app.js

echo "[3/4] Add CSS to prevent modal-open from scrolling issues (if missing)"
if [ -f app.css ]; then
  grep -q "html.modal-open" app.css || cat >> app.css <<'CSS'

html.modal-open, html.modal-open body {
  overflow: hidden;
}
CSS
fi

echo "[4/4] Done. Show route/account block for quick sanity:"
grep -n "route(\"/account\"" -n app.js | head -n 5 || true
