#!/usr/bin/env bash
# Pubblica dist/ sul ramo gh-pages (GitHub Pages: Settings → Pages → Branch gh-pages, cartella / root).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=${OUT:-dist}
npx vite build --outDir "$OUT" --emptyOutDir
TMP=$(mktemp -d)
cp -r "$OUT"/. "$TMP"/
touch "$TMP/.nojekyll"
cd "$TMP"
git init -q -b gh-pages
git add -A
git -c user.name="The London Academy" -c user.email="info@thelondonacademy.it" commit -q -m "Pubblicazione del sito ($(date -u +%Y-%m-%d))"
git push -f "https://github.com/Thelondonacademy/make-and-code-lab" gh-pages
rm -rf "$TMP"
