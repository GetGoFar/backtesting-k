#!/usr/bin/env bash
# Sincroniza la página canónica de la Liga a su espejo y regenera la copia de preview local.
set -e
cd "$(dirname "$0")/public"
CANON="liga-preview-2026-05.html"
# 1) espejo idéntico que consume el widget de WordPress / Vercel
cp "$CANON" "preview/liga-fondos-basura.html"
# 2) copia de desarrollo con el auto-fetch a la API desactivado (404 instantáneo -> fallback hardcoded)
sed -e 's#/api/liga/snapshot?bootstrap=1#/api/__disabled_for_preview__#' \
    -e 's#/api/liga/classify#/api/__disabled_for_preview__#' \
    "$CANON" > ../../liga-dev/index.html
echo "Sincronizado: preview/liga-fondos-basura.html + liga-dev/index.html"
