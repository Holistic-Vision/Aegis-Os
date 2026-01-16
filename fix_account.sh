#!/data/data/com.termux/files/usr/bin/bash
set -e

cd "$(dirname "$0")/docs"

echo "[1/4] Backup..."
TS="$(date +%Y%m%d_%H%M%S)"
cp -a app.js "app.js.bak_$TS"
cp -a app.css "app.css.bak_$TS" 2>/dev/null || true

echo "[2/4] Patch ensureConsent(): addEventListener on NodeList -> forEach"
# Convert patterns like: qsa('...').addEventListener('click', fn)
# into: qsa('...').forEach(el => el.addEventListener('click', fn))
perl -0777 -i -pe '
  s/\bqsa\(\s*([^)]+)\s*\)\s*\.addEventListener\(\s*([^)]+)\s*\)/
    "qsa(".$1.").forEach(el => el.addEventListener(".$2."))"/gex;
' app.js

echo "[3/4] Add safe bottom padding for fixed navbar (if missing)"
if [ -f app.css ]; then
  grep -q '#root[^}]*padding-bottom' app.css || cat >> app.css <<'CSS'

/* AEGIS: prevent bottom nav overlay on content (safe-area aware) */
#root{
  padding-bottom: calc(96px + env(safe-area-inset-bottom));
}
CSS
fi

echo "[4/4] Done. Summary diff:"
git diff -- docs/app.js docs/app.css | sed -n '1,180p' || true

echo
echo "Next:"
echo "  cd .."
echo "  git add -A"
echo "  git commit -m \"Fix account click freeze + bottom padding\""
echo "  git push"
