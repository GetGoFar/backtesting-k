# Liga de Fondos Basura — Despliegue

Tres piezas que conectar:

1. **WordPress** (snippet PHP + edición del widget Elementor).
2. **Vercel / `backtesting-k`** (variables de entorno + cron).
3. **Smoke test end-to-end**.

---

## 1. WordPress

### 1.1 — Snippet WPCode "Liga Snapshot API"

1. WP Admin → WPCode → Add New Snippet → PHP, "Run everywhere".
2. Pegar el contenido de `wordpress/liga-snapshot-snippet.php`.
3. Guardar como **activo**.

Verificar:

```bash
# debe devolver 503 (snapshot no generado todavía)
curl -i https://elproyectok.com/wp-json/epk/v1/liga-snapshot
```

### 1.2 — Token estático para el push autenticado

> **Nota (abr 2026):** Application Passwords está deshabilitado en este WP
> (lo bloquea algún plugin de seguridad / Hostinger), y WordPress core
> intercepta cualquier `Authorization: Basic …` ANTES del `permission_callback`
> y devuelve `rest_forbidden`. Por eso el snippet usa un header custom
> `X-Liga-Token` y un token estático embebido en la copia de WPCode.
>
> El archivo `wordpress/liga-snapshot-snippet.php` versiona `__REPLACE_ME__`
> como placeholder; el token real solo vive en la base de datos de WordPress
> y en la env var `WP_LIGA_TOKEN` de Vercel.

Para rotar el token: generar uno nuevo (`openssl rand -hex 32`), pegarlo
en el snippet WPCode (sustituyendo el `$expected = '...'`) y actualizar
`WP_LIGA_TOKEN` en Vercel.

### 1.3 — Modificar el widget HTML de Elementor

Editar la página `/liga-fondos-basura/`, abrir el widget HTML que contiene el `eval(atob(...))`.

**Opción A (mínima invasión, recomendada):** dejar el `eval(atob(...))` tal cual y AÑADIR al final del widget:

```html
<script src="https://elproyectok.com/wp-content/uploads/liga-widget-fetcher.js"></script>
```

(subir antes el archivo `wordpress/liga-widget-fetcher.js` a `wp-content/uploads/`).

**Opción B:** pegar el contenido entero de `liga-widget-fetcher.js` en un nuevo `<script>` justo antes del `</script>` del `eval(atob)`. No requiere subir archivos.

(Opcional pero recomendado) sustituir el texto "Última actualización: …" por:

```html
Última actualización: <span id="liga-updated-at">febrero 2026</span>
```

Así, cuando el snapshot llegue, la fecha se actualiza sola. El texto inicial sirve de fallback.

---

## 2. Vercel (`backtesting-k`)

### 2.1 — Variables de entorno

En Vercel → Project → Settings → Environment Variables (Production + Preview):

| Variable | Valor |
|----|----|
| `EODHD_API_TOKEN` | (ya existe) |
| `KV_REST_API_URL` | opcional; si está, el snapshot persiste entre cold starts |
| `KV_REST_API_TOKEN` | idem |
| `CRON_SECRET` | generar uno fuerte: `openssl rand -hex 32` |
| `WORDPRESS_URL` | `https://elproyectok.com` |
| `WP_LIGA_TOKEN` | mismo token que el `$expected` embebido en el snippet WPCode (paso 1.2). El cron envía el header `X-Liga-Token` con este valor. |

### 2.2 — Cron (semanal, lunes 06:00 UTC)

Ya está añadido en `vercel.json`. Tras el primer deploy con esa entrada, Vercel
registra el cron automáticamente.

### 2.3 — Deploy

```bash
git add src/data/liga-fondos.csv src/lib/liga-engine.ts src/lib/liga-engine.test.ts \
        src/lib/liga-storage.ts src/app/api/liga vercel.json wordpress \
        scripts/liga-smoke-test.ts
git commit -m "feat: liga de fondos basura — snapshot automático desde EODHD"
git push
```

---

## 3. Smoke test end-to-end

Tras el deploy:

```bash
# 1) refresh manual
curl -i -X POST https://backtesting-k.vercel.app/api/liga/refresh \
  -H "Authorization: Bearer $CRON_SECRET"
# Esperado: 200, JSON con totalFondos=100, fondosOk≈97, pushedToWp.ok=true

# 2) snapshot público
curl -s https://elproyectok.com/wp-json/epk/v1/liga-snapshot | jq '.totalFondos, .generadoEn'

# 3) la página
# abrir https://elproyectok.com/liga-fondos-basura/ y verificar:
#   - tabla se rellena con datos frescos (≠ los hardcoded)
#   - fecha en header refleja "abril 2026" (mes del refresh)
#   - calculadora sigue funcionando: meter ISIN ES0114277033 → encuentra el fondo
```

Si la tabla NO se rellena, abrir DevTools y mirar consola: el wrapper hace
`console.warn` con el motivo si el fetch falló.

---

## Mantenimiento

- **Añadir / quitar fondos**: editar `src/data/liga-fondos.csv` en el repo y pushear. El próximo cron usa la nueva lista.
- **Revisar benchmarks**: la primera versión inferí el benchmark por nombre del fondo. Para los fondos con `benchmark_notas = "iShares MSCI World (default)"`, conviene revisar si MSCI World es lo correcto (ej. fondos value-style como Cobas suelen usar MSCI World Value como referencia, lo que da un alfa muy diferente).
- **TER**: sigue siendo manual en el CSV (EODHD a veces lo da, a veces no). Revisión anual basta.

## Diagnóstico

```bash
# ver el último snapshot que tiene Vercel en Redis
curl -s https://backtesting-k.vercel.app/api/liga/snapshot | jq '.generadoEn, .fondosOk, .fondosStale'

# ver qué fondos están "stale"
curl -s https://backtesting-k.vercel.app/api/liga/snapshot | jq '.fondos[] | select(.stale==true) | {isin, nombre, error}'
```
