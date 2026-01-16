#!/data/data/com.termux/files/usr/bin/bash
set -e
cd "$(dirname "$0")/docs"

TS="$(date +%Y%m%d_%H%M%S)"
cp -a router.js "router.js.bak_$TS"
cp -a app.css "app.css.bak_$TS" 2>/dev/null || true

echo "[1/3] Inject unblockUI() in router.js (runs on every navigate + after render)"
perl -0777 -i -pe '
# Add helper once (near top, after BASE const is fine)
if($_ !~ /function\s+unblockUI\s*\(/s){
  s/(const\s+BASE\s*=\s*detectBase\(\);\s*)/$1\n\nfunction unblockUI(){\n  try{\n    // Remove common blocking overlays/backdrops\n    const kill = [\".modal\", \".overlay\", \".backdrop\", \".dialog\", \".sheet\", \".drawer-backdrop\", \".toast-backdrop\", \"#consentOverlay\", \"#consent_overlay\", \"#consentModal\", \"#consent_modal\", \"#overlay\", \"#backdrop\"]; \n    kill.forEach(sel => document.querySelectorAll(sel).forEach(el => el.remove()));\n\n    // Restore interactions\n    document.documentElement.style.overflow = \"\";\n    document.body.style.overflow = \"\";\n    document.body.style.touchAction = \"\";\n    document.body.style.pointerEvents = \"\";\n\n    const root = document.getElementById(\"root\");\n    if(root){\n      root.style.pointerEvents = \"auto\";\n      root.style.touchAction = \"manipulation\";\n    }\n\n    // If a full-screen fixed element is accidentally covering everything, disable pointer events on it\n    document.querySelectorAll(\"body *\").forEach(el => {\n      const st = getComputedStyle(el);\n      if(st.position === \"fixed\"){\n        const z = parseInt(st.zIndex || \"0\", 10);\n        if(z >= 9999 && el.id !== \"root\"){\n          el.style.pointerEvents = \"none\";\n        }\n      }\n    });\n  }catch(e){}\n}\n\n/sm;
}

# Call unblockUI() after every successful render() (end of render)
s/(await\s+navigate\(\"\/home\",\s*true\);\s*\n\}\s*)/await navigate(\"\/home\", true);\n}\n\nunblockUI();\n/sm;

# Also call unblockUI() at the start of navigate()
s/(export\s+async\s+function\s+navigate\s*\(\s*path\s*,\s*replace\s*=\s*false\s*\)\s*\{\s*)/$1\n  unblockUI();\n/sm
' router.js

echo "[2/3] Ensure #root always clickable & safe-area padding (CSS hardening)"
if [ -f app.css ]; then
  if ! grep -q "AEGIS_UNBLOCK_CSS" app.css; then
    cat >> app.css <<'CSS'

/* AEGIS_UNBLOCK_CSS */
#root{
  pointer-events:auto;
  touch-action:manipulation;
}
/* prevent bottom nav overlay (safe-area) */
#root{ padding-bottom: calc(96px + env(safe-area-inset-bottom)); }
CSS
  fi
fi

echo "[3/3] Done. Show diff summary:"
git diff -- docs/router.js docs/app.css | sed -n '1,220p' || true
