# Despliegue — Liga: DQ por ventana + ranking por DQ3

Cambio de metodología de la Liga de Fondos Basura, listo para desplegar.

## Qué cambia
- **DQ por ventana**: el DQ a 3/5/10 años se calcula con el alfa de *su propia*
  ventana (antes: una sola alfa larga proyectada a los tres plazos).
- **Ranking por DQ3** (antes DQ5): es la ventana que todos los fondos tienen real.
- **No-monotonía permitida**: un fondo puede tener DQ3 > DQ5 (ha empeorado
  recientemente). Documentado en la nota de metodología.

## Impacto (verificado sobre snapshot 2026-06-05, 97 fondos)
- True Value (ES0180792006): #5 → **#2 champions** (DQ3 24.057 → 30.703 €).
- Bestinver Internacional (ES0114638036): champions → **#50 permanencia** (DQ3 14.939 → 951 €).
- **57/97 fondos se reordenan**; cambia el cartel de "champions" (entran USA-tech
  y salud temática). Revisa el nuevo top-25 antes de citarlo en LinkedIn.

## Pasos
1. **Automático** (script): `pwsh ./scripts/deploy-liga-dq3.ps1`
   - typecheck → tests → commit → push → (si `$env:CRON_SECRET`) refresh.
   - Para solo checks + commit local sin push: `... -NoPush`.
2. **Manual A**: subir `wordpress/liga-widget-fetcher.js` a `wp-content/uploads/`.
3. **Manual B**: pegar `scripts/metodologia-liga-snippet.html` en el bloque
   "Metodología" del widget Elementor de `/liga-fondos-basura/`.
4. **Smoke test**: abrir la página y confirmar el reordenamiento (True Value arriba,
   Bestinver a media tabla).

## Ficheros tocados
| Fichero | Cambio |
|---|---|
| `src/lib/liga-engine.ts` | `proyectarDineroQuemado` por ventana; ranking por DQ3; campo `dq3Proyectado` |
| `src/lib/liga-classify.ts` | `posicionEnRanking` y `dqRanking` por DQ3 |
| `src/lib/liga-engine.test.ts` | tests nuevos; fix benchmark mock (IWDA→SPYY); 1 skip |
| `src/lib/liga-classify.test.ts` | tests `posicionEnRanking` a escala DQ3 |
| `wordpress/liga-widget-fetcher.js` (+ 2 mirrors) | reordenado cliente DQ5→DQ3 |
| `public/preview/liga-fondos-basura.html` | nota de metodología reescrita |

## Notas / deuda técnica detectada (pre-existente, no de este cambio)
- Los tests de integración de `generarSnapshot` estaban **rotos** porque los mocks
  simulaban `IWDA.AS` y el motor mide contra `SPYY.XETRA`. **Corregido** en este lote.
- `asignarTendencia` (tendencia = delta-dq5 entre snapshots) es **código muerto**:
  el motor usa momentum 30d (`calcularTendencia30dias`). Su test quedó en `it.skip`.
  Pendiente: reescribir el test con series de momentum o eliminar `asignarTendencia`.
- `public/wordpress/liga-widget-fetcher.js` tiene un texto stale aparte ("...datos
  frescos de Morningstar") que el canónico `wordpress/` ya no tiene. No bloquea.
