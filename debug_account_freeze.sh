#!/data/data/com.termux/files/usr/bin/bash
set -e
cd "$(dirname "$0")/docs"

TS="$(date +%Y%m%d_%H%M%S)"
cp -a app.js "app.js.bak_$TS"
cp -a router.js "router.js.bak_$TS"

echo "[1/3] Add global crash overlay (window.onerror + unhandledrejection) into app.js"
perl -0777 -i -pe '
if($ARGV eq "app.js"){
  if($_ !~ /__AEGIS_CRASH_OVERLAY__/s){
    s/(^|\n)(\s*)(\/\/\s*AEGIS|\s*import|\s*const|\s*let)/$1$2const __AEGIS_CRASH_OVERLAY__ = () => {\n$2  const show = (title, msg) => {\n$2    try {\n$2      const root = document.getElementById(\"root\");\n$2      const box = document.createElement(\"div\");\n$2      box.style.cssText = \"position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,.78);backdrop-filter:blur(6px);padding:16px;overflow:auto;\";\n$2      box.innerHTML = `\n$2        <div style=\"max-width:820px;margin:0 auto;background:rgba(18,18,18,.92);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:14px;\">\n$2          <h2 style=\"margin:0 0 10px 0;\">${title}</h2>\n$2          <div style=\"opacity:.9;white-space:pre-wrap;line-height:1.35;\">${msg}</div>\n$2          <div style=\"margin-top:12px;display:flex;gap:10px;justify-content:flex-end;\">\n$2            <button class=\"btn\" id=\"crash_reload\">Recharger</button>\n$2          </div>\n$2        </div>`;\n$2      document.body.appendChild(box);\n$2      const b = document.getElementById(\"crash_reload\");\n$2      if(b) b.addEventListener(\"click\", ()=>location.reload(), {passive:true});\n$2      if(root) root.style.pointerEvents = \"none\";\n$2    } catch(e) {}\n$2  };\n$2  window.addEventListener(\"error\", (e)=>{\n$2    const m = (e && e.error && e.error.stack) ? e.error.stack : (e && e.message ? e.message : String(e));\n$2    show(\"Erreur JavaScript\", m);\n$2  });\n$2  window.addEventListener(\"unhandledrejection\", (e)=>{\n$2    const r = e && e.reason;\n$2    const m = (r && r.stack) ? r.stack : (r ? String(r) : \"Promise rejected\");\n$2    show(\"Promise rejetée\", m);\n$2  });\n$2};\n$2__AEGIS_CRASH_OVERLAY__();\n\n$2$3/sm;
  }
}
' app.js

echo "[2/3] Wrap router.render() in try/catch to surface errors"
perl -0777 -i -pe '
s/export\s+async\s+function\s+render\s*\(\s*\)\s*\{\s*/export async function render(){\n  try{\n/sm
s/\n\}\s*$/\n  }catch(e){\n    try{\n      const msg = (e && e.stack) ? e.stack : String(e);\n      const root = document.getElementById(\"root\");\n      if(root){\n        root.innerHTML = `<div class=\"grid\"><div class=\"card\"><h2>Erreur de rendu</h2><div class=\"small\" style=\"white-space:pre-wrap;opacity:.9\">${msg}</div></div></div>`;\n      }\n    }catch(_e){}\n  }\n}\n/sm
' router.js

echo "[3/3] Done. Quick checks:"
grep -n "__AEGIS_CRASH_OVERLAY__" app.js | head -n 2 || true
grep -n "export async function render" router.js | head -n 2 || true
