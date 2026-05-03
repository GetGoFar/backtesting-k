# Preview en producción

## URL para ver el resultado

```
https://backtesting-k.vercel.app/liga-preview-2026-05.html
```

(añadir `?cb=algo` si Vercel responde con un 404 cacheado)

La primera carga puede tardar **~30 segundos** porque dispara una regeneración
del snapshot desde EODHD (`?bootstrap=1` en el endpoint). Las siguientes cargas
son instantáneas porque el snapshot queda cacheado en Redis (si está
configurado) o en memoria del proceso.

Esta página es **una copia del widget Elementor real** con el mismo
CSS y la misma estructura de tabla. La única diferencia visible es:

1. La columna nueva **Tend.** al final de cada fila.
2. La fecha del header se actualiza sola con la fecha del último snapshot
   automático.
3. Los datos vienen de `/api/liga/snapshot` (no son los hardcoded de
   febrero 2026).

## Qué falta para que el cron mensual corra solo

En **Vercel → Project → Settings → Environment Variables**, añadir:

| Variable | Valor |
|---|---|
| `CRON_SECRET` | un token fuerte: `openssl rand -hex 32` |
| `WORDPRESS_URL` | `https://elproyectok.com` |
| `WP_LIGA_TOKEN` | el mismo token que pusiste en el snippet WPCode |

Tras guardar, **redeploy** (basta con un commit vacío o el botón "Redeploy"
sin cambios). Vercel registra automáticamente el cron del `vercel.json`.

Para forzar el primer refresh manual sin esperar al día 1:

```bash
curl -X POST https://backtesting-k.vercel.app/api/liga/refresh \
  -H "Authorization: Bearer $CRON_SECRET"
```

Esto tarda ~30s, devuelve `{"ok":true,"totalFondos":100,"fondosOk":97,...}`
y empuja el snapshot a WordPress (si `WORDPRESS_URL` y `WP_LIGA_TOKEN` están
puestos).

## Qué falta para que la web pública use estos datos

Solo dos cosas en WordPress:

1. **Subir el archivo `liga-widget-fetcher.js`** a `wp-content/uploads/`.
2. **Editar el widget HTML de Elementor** de `/liga-fondos-basura/` y añadir
   al final, justo antes de `</script>`:

   ```html
   <script src="/wp-content/uploads/liga-widget-fetcher.js"></script>
   ```

3. (Opcional) Sustituir el texto "Última actualización: febrero 2026" por:
   ```html
   Última actualización: <span id="liga-updated-at">febrero 2026</span>
   ```
   para que la fecha se actualice sola.

El snippet PHP (`liga-snapshot-snippet.php`) ya está listo para pegar en
WPCode con el token real en lugar de `__REPLACE_ME__`.

## Verificación final tras esos pasos

```bash
# debe devolver el snapshot actual
curl -s https://elproyectok.com/wp-json/epk/v1/liga-snapshot | jq '.totalFondos, .generadoEn, .fondosOk'

# en la página visible:
# - tabla con datos frescos (no febrero 2026)
# - columna Tend. al final
# - calculadora siguiendo OK con detección de ISIN
```

Si algo va mal, abrir DevTools en la página y mirar consola: el fetcher hace
`console.warn` con el motivo y la tabla cae al fallback hardcoded sin que
el usuario vea nada raro.
