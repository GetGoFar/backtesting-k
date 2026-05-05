/* =============================================================================
 * Liga de Fondos Basura — Snapshot fetcher
 * =============================================================================
 *
 * Pega este script en el widget HTML de Elementor de la página
 * /liga-fondos-basura/, en un nuevo bloque "<\script>" AL FINAL del widget
 * (justo antes del "<\/script>" de cierre del eval(atob)).
 *
 * IMPORTANTE: las cadenas "<\script>" y "<\/script>" arriba llevan barra
 * invertida adrede para no romper el parser HTML cuando este fichero se
 * pega INLINE dentro de un bloque "<\script>...<\/script>". El parser HTML
 * cierra el script en el primer "<\/script>" literal que ve, INCLUSO si
 * está dentro de un comentario JS, y rompe la página. No quites las
 * barras de los comentarios.
 *
 * NO toques el bloque eval(atob) existente. Este wrapper se ejecuta DESPUÉS
 * y reemplaza los datos hardcoded por los frescos del snapshot.
 *
 * Comportamiento:
 *   - Llama a /wp-json/epk/v1/liga-snapshot
 *   - Si responde OK: reemplaza filas, actualiza LIGA_ISIN/LIGA_DQ10/LIGA_TOTAL,
 *     refresca zone headers vía applyFilters().
 *   - Si falla: deja la tabla hardcoded como fallback (graceful degradation).
 *
 * Requisitos en el HTML:
 *   - <table id="ranking-table">…<tbody>…</tbody></table>  (ya existe)
 *   - (opcional) <span id="liga-updated-at"></span> para mostrar la fecha
 *   - (opcional) <span id="liga-snapshot-status"></span> para errores
 *
 * ============================================================================= */

(function () {
	'use strict';

	// Override permite usar este script tanto en WordPress (default WP REST endpoint)
	// como en el harness de pruebas en localhost (apunta al endpoint Next.js).
	var SNAPSHOT_URL = ( typeof window !== 'undefined' && window.__LIGA_SNAPSHOT_URL_OVERRIDE )
		|| '/wp-json/epk/v1/liga-snapshot';
	var STATUS_EL_ID = 'liga-snapshot-status';
	var DATE_EL_ID = 'liga-updated-at';

	function fmtEur( n ) {
		if ( n == null || isNaN( n ) ) return '—';
		var sign = n < 0 ? '-' : ( n > 0 ? '−' : '' ); // U+2212 para coherencia con el render existente
		var abs = Math.abs( Math.round( n ) );
		return sign + abs.toLocaleString( 'es-ES' ) + ' €';
	}

	function dqClass( n ) {
		if ( n == null ) return '';
		return n > 0 ? 'dq-neg' : 'dq-pos';
	}

	/** Construye la fila <tr> de un fondo respetando la estructura existente. */
	function renderRow( f, rank ) {
		var tr = document.createElement( 'tr' );
		tr.setAttribute( 'data-orig-rank', rank );
		tr.setAttribute( 'data-bank', f.gestora || '' );
		tr.setAttribute( 'data-type', f.tipo || '' );
		tr.setAttribute( 'data-ter', f.ter != null ? String( f.ter ) : '' );
		tr.setAttribute( 'data-dq3', f.dq3 != null ? String( f.dq3 ) : '0' );
		tr.setAttribute( 'data-dq5', f.dq5 != null ? String( f.dq5 ) : '0' );
		tr.setAttribute( 'data-dq10', f.dq10 != null ? String( f.dq10 ) : '0' );
		if ( f.stale ) tr.setAttribute( 'data-stale', '1' );

		var tipo = f.tipo || '';
		var typeBadge = tipo
			? '<span class="type-badge type-' + tipo.toLowerCase() + '">' + tipo + '</span>'
			: '';

		var dq3html = '<span class="' + dqClass( f.dq3 ) + '">' + fmtEur( f.dq3 ) + '</span>';
		var dq5html = '<span class="' + dqClass( f.dq5 ) + '">' + fmtEur( f.dq5 ) + '</span>';
		var dq10html = '<span class="' + dqClass( f.dq10 ) + '">' + fmtEur( f.dq10 ) + '<span class="proj">*</span></span>';

		// Barra de impacto: porcentual respecto al peor dq10 conocido (se calcula fuera)
		var barWidth = Math.min( 100, Math.max( 0, f.__barPct || 0 ) );
		var barColor = f.dq10 > 0 ? '#ff4444' : '#4caf50';
		var bar = '<div class="impact-bar-wrap"><div class="impact-bar" style="width:' + barWidth + '%;background:' + barColor + '"></div></div>';

		tr.innerHTML =
			'<td class="rank">' + rank + '</td>' +
			'<td class="fname">' + escapeHtml( f.nombre || '' ) + ' ' + typeBadge + '</td>' +
			'<td class="bname">' + escapeHtml( f.gestora || '' ) + '</td>' +
			'<td class="isin">' + escapeHtml( f.isin || '' ) + '</td>' +
			'<td class="ter">' + ( f.ter != null ? f.ter.toFixed( 2 ) + '%' : '—' ) + '</td>' +
			'<td class="dq-value">' + dq3html + '</td>' +
			'<td class="dq-value">' + dq5html + '</td>' +
			'<td class="dq-value">' + dq10html + '</td>' +
			'<td class="dq-value">' + bar + '</td>' +
			'<td class="trend">' + renderTendencia( f ) + '</td>';
		return tr;
	}

	/**
	 * Devuelve el HTML del indicador de tendencia respecto al snapshot anterior:
	 *   ▲ verde   → dq5 bajó (fondo mejorando)
	 *   ▼ rojo    → dq5 subió (fondo empeorando)
	 *   = gris    → variación dentro del umbral (estable)
	 *   ★ azul    → fondo nuevo en la liga
	 *   ·         → no hay snapshot anterior para comparar
	 * El title del span muestra el delta exacto en €.
	 */
	function renderTendencia( f ) {
		var t = f.tendencia || 'sin_ref';
		var delta = ( f.deltaDq5 != null ) ? f.deltaDq5 : null;
		var deltaTxt = delta != null
			? ( delta >= 0 ? '+' : '' ) + Math.round( delta ).toLocaleString( 'es-ES' ) + ' €'
			: '';
		var iconos = {
			mejorando:  { glyph: '▲', color: '#2a9d3f', label: 'Mejorando vs mes anterior' },
			empeorando: { glyph: '▼', color: '#c62828', label: 'Empeorando vs mes anterior' },
			estable:    { glyph: '=', color: '#888',    label: 'Estable vs mes anterior' },
			nuevo:      { glyph: '★', color: '#1d4ed8', label: 'Nuevo en la liga' },
			sin_ref:    { glyph: '·', color: '#bbb',    label: 'Sin referencia previa' }
		};
		var spec = iconos[ t ] || iconos.sin_ref;
		var title = spec.label + ( deltaTxt ? ' (Δ ' + deltaTxt + ')' : '' );
		return '<span class="trend-icon trend-' + t + '" style="color:' + spec.color + ';font-weight:600" title="' + escapeHtml( title ) + '">' + spec.glyph + '</span>';
	}

	/** Inserta el <th>Tend.</th> en el thead si todavía no existe. */
	function asegurarHeaderTendencia() {
		var thead = document.querySelector( '#ranking-table thead tr' );
		if ( ! thead ) return;
		if ( thead.querySelector( '.th-trend' ) ) return;
		var th = document.createElement( 'th' );
		th.className = 'th-trend';
		th.textContent = 'Tend.';
		th.title = 'Tendencia respecto a la actualización anterior';
		thead.appendChild( th );
	}

	function escapeHtml( s ) {
		return String( s )
			.replace( /&/g, '&amp;' )
			.replace( /</g, '&lt;' )
			.replace( />/g, '&gt;' )
			.replace( /"/g, '&quot;' );
	}

	function rebuildTable( fondos ) {
		var tbody = document.querySelector( '#ranking-table tbody' );
		if ( ! tbody ) return false;
		asegurarHeaderTendencia();

		// Filtrar fondos con datos válidos para mostrar primero, stale al final
		var conDatos = fondos.filter( function ( f ) { return f.dq5 != null && ! f.stale; } );
		var stale = fondos.filter( function ( f ) { return f.stale; } );
		// Ordenar conDatos descendente por dq5 (mayor = peor)
		conDatos.sort( function ( a, b ) { return ( b.dq5 || 0 ) - ( a.dq5 || 0 ); } );

		// Calcular % barra de impacto (relativo al peor dq10 absoluto)
		var maxAbsDq10 = 1;
		fondos.forEach( function ( f ) {
			var v = Math.abs( f.dq10 || 0 );
			if ( v > maxAbsDq10 ) maxAbsDq10 = v;
		} );
		fondos.forEach( function ( f ) {
			f.__barPct = ( ( Math.abs( f.dq10 || 0 ) / maxAbsDq10 ) * 100 ).toFixed( 1 );
		} );

		// Vaciar y reconstruir
		tbody.innerHTML = '';
		conDatos.forEach( function ( f, i ) {
			tbody.appendChild( renderRow( f, i + 1 ) );
		} );
		stale.forEach( function ( f, i ) {
			var tr = renderRow( f, conDatos.length + i + 1 );
			tr.style.opacity = '0.6';
			tbody.appendChild( tr );
		} );

		return true;
	}

	function actualizarLookups( fondos ) {
		// LIGA_ISIN: mapa ISIN → {n, b}
		var isinMap = {};
		fondos.forEach( function ( f ) {
			if ( f.isin ) isinMap[ f.isin ] = { n: f.nombre, b: f.gestora };
		} );

		// LIGA_DQ10: array de dq10 redondeados ordenados desc (para ranking de la calculadora)
		var dq10Sorted = fondos
			.filter( function ( f ) { return f.dq10 != null && ! f.stale; } )
			.map( function ( f ) { return Math.round( f.dq10 ); } )
			.sort( function ( a, b ) { return b - a; } );

		try { window.LIGA_ISIN = isinMap; } catch ( e ) {}
		try { window.LIGA_DQ10 = dq10Sorted; } catch ( e ) {}
		try { window.LIGA_TOTAL = dq10Sorted.length; } catch ( e ) {}
	}

	function actualizarFecha( generadoEn ) {
		var el = document.getElementById( DATE_EL_ID );
		if ( ! el ) return;
		try {
			var d = new Date( generadoEn );
			var meses = [ 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
				'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre' ];
			el.textContent = meses[ d.getUTCMonth() ] + ' ' + d.getUTCFullYear();
		} catch ( e ) {
			el.textContent = '';
		}
	}

	function setStatus( msg ) {
		var el = document.getElementById( STATUS_EL_ID );
		if ( el ) el.textContent = msg || '';
	}

	function aplicarFiltrosSeguro() {
		// applyFilters está definido por el script principal (eval(atob))
		// reaplica zone headers y orden actual.
		if ( typeof window.applyFilters === 'function' ) {
			try { window.applyFilters(); } catch ( e ) { /* ignore */ }
		}
		// Las zone-rows que crea applyFilters tienen colspan=9 hardcoded — al
		// añadir la columna Tend. necesitamos +1.
		parchearColspans();
	}

	/** Ajusta colspan de las filas zone-* a 10 si se quedaron en 9. */
	function parchearColspans() {
		var celdas = document.querySelectorAll( '#ranking-table tbody tr.zone-row td[colspan]' );
		celdas.forEach( function ( td ) {
			if ( parseInt( td.getAttribute( 'colspan' ), 10 ) === 9 ) {
				td.setAttribute( 'colspan', '10' );
			}
		} );
	}

	function inicializar() {
		fetch( SNAPSHOT_URL, { credentials: 'same-origin' } )
			.then( function ( r ) {
				if ( ! r.ok ) throw new Error( 'HTTP ' + r.status );
				return r.json();
			} )
			.then( function ( snap ) {
				if ( ! snap || ! Array.isArray( snap.fondos ) || snap.fondos.length === 0 ) {
					throw new Error( 'snapshot vacío' );
				}
				var ok = rebuildTable( snap.fondos );
				if ( ! ok ) throw new Error( 'no se encontró #ranking-table tbody' );
				actualizarLookups( snap.fondos );
				actualizarFecha( snap.generadoEn );
				aplicarFiltrosSeguro();
				setStatus( '' );
			} )
			.catch( function ( err ) {
				console.warn( '[liga-fetcher] usando datos hardcoded como fallback:', err );
				setStatus( '' ); // mantener silencio para el usuario; los datos hardcoded se ven igual
			} );

		instalarClassifyEnDetectFund();
	}

	/* ---------------------------------------------------------------------------
	 * detectFund() enriquecido: tras el lookup Morningstar, llama a
	 * /api/liga/classify para mostrar la posición teórica del fondo en la liga.
	 * ------------------------------------------------------------------------- */

	// Override permite probar contra el dev server de Next.js
	var CLASSIFY_URL = ( typeof window !== 'undefined' && window.__LIGA_CLASSIFY_URL_OVERRIDE )
		|| '/api/liga/classify';
	// Cuando estamos en el harness de pruebas, classify vive en el mismo Vercel
	// que el snapshot. En producción Wordpress hay que apuntarlo a Vercel también
	// (no tiene sentido proxiear esto por WP). Si __LIGA_VERCEL_BASE está definido
	// se usa como prefijo absoluto.
	var VERCEL_BASE = ( typeof window !== 'undefined' && window.__LIGA_VERCEL_BASE ) || '';

	function urlClassify( isin ) {
		var base = VERCEL_BASE || '';
		var path = CLASSIFY_URL;
		// Si CLASSIFY_URL es path relativo y tenemos VERCEL_BASE, anteponemos
		if ( path.charAt( 0 ) === '/' && base ) path = base + path;
		return path + '?isin=' + encodeURIComponent( isin );
	}

	function instalarClassifyEnDetectFund() {
		// El detectFund() original vive en el window scope (lo crea el eval(atob)).
		// Lo envolvemos en un wrapper que añade un fetch a /api/liga/classify
		// cuando el ISIN es válido y el fondo NO está en la liga.
		var debounceTimer = null;
		var lastClassifiedIsin = '';

		function isinValido( s ) {
			return /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test( ( s || '' ).toUpperCase() );
		}

		function pintarClassify( box, datos ) {
			if ( ! datos || datos.error ) {
				var det = ( datos && datos.detalle ) || 'sin información';
				var msg = '';
				if ( datos && datos.error === 'no_eodhd' ) {
					msg = 'No tenemos histórico suficiente de este fondo en EODHD. ' +
						'Esto suele pasar con fondos muy nuevos o poco transparentes — ya es una primera mala señal.';
				} else if ( datos && datos.error === 'no_morningstar' ) {
					msg = 'No encontramos este fondo en Morningstar. Verifica el ISIN.';
				} else if ( datos && datos.error === 'rango_corto' ) {
					msg = 'Este fondo lleva menos de 1 año cotizando — no podemos calcular su alfa todavía.';
				} else {
					msg = 'No pudimos clasificarlo automáticamente: ' + det;
				}
				agregarBloqueClassify( box, '<div class="liga-classify-error">' + escapeHtml( msg ) + '</div>' );
				// Si el classify falla, MOSTRAMOS el flujo manual como fallback
				toggleFlujoManual( true );
				return;
			}

			// Cuando el classify devuelve datos válidos, ocultamos el flujo manual
			// porque el resultado ya está completo y mostrado.
			toggleFlujoManual( false );

			var dq5fmt = fmtEur( datos.dq5 );
			var dq10fmt = fmtEur( datos.dq10 );
			var alfaFmt = ( datos.alfa != null ) ? datos.alfa.toFixed( 2 ) + '%' : '—';
			var bench = datos.benchmarkUsado;
			var benchTxt = bench
				? bench.nombre + ( bench.ticker ? ' (' + bench.ticker + ')' : '' )
				: '— (en la liga, benchmark del CSV)';
			var esMixto = bench && bench.composicion ? true : false;

			var zonaLabel = {
				champions: '🏆 Champions de la Basura',
				europa: '🔥 Europa League',
				permanencia: '😐 Zona Permanencia',
				descenso: '📉 Zona Descenso'
			}[ datos.zona ] || datos.zona || '—';
			var zonaTooltip = {
				champions: 'top 25% peor — los más caros y/o que más se han alejado del índice',
				europa: 'cuartil 2 — significativamente peores que el benchmark',
				permanencia: 'cuartil 3 — pierden poco contra el benchmark',
				descenso: 'mejor 25% — los menos malos (o incluso ganadores netos contra benchmark)'
			}[ datos.zona ] || '';
			var aniosTxt = ( datos.anosObservados != null )
				? datos.anosObservados.toFixed( 1 ) + ' años'
				: 'N/A';

			// Disclaimer adicional para mixtos: la cesta sintética por defecto puede
			// no encajar con la distribución real del fondo
			var disclaimerMixto = esMixto
				? '<div class="lc-row lc-warn">⚠️ Fondo mixto: comparación contra ' +
				  escapeHtml( bench.composicion.descripcion ) +
				  '. Si tu fondo tiene otra distribución (más agresivo o más conservador), las cifras pueden no ser justas.</div>'
				: '';

			var html =
				'<div class="liga-classify-result">' +
				'<div class="lc-row lc-zona" title="' + escapeHtml( zonaTooltip ) + '"><strong>Posición teórica:</strong> ' +
					'<span class="lc-pos">#' + datos.posicionTeorica + ' de ' + datos.totalEnLiga + '</span> · ' +
					'<span class="lc-zona-tag">' + escapeHtml( zonaLabel ) + '</span></div>' +
				'<div class="lc-row"><strong>Alfa anualizada:</strong> ' + alfaFmt +
					' · <strong>Periodo:</strong> ' + aniosTxt + '</div>' +
				'<div class="lc-row"><strong>Dinero quemado por 100k €:</strong> ' +
					'5A ' + dq5fmt + ' · 10A ' + dq10fmt + '</div>' +
				disclaimerMixto +
				'<div class="lc-row lc-bench">Benchmark usado: ' + escapeHtml( benchTxt ) +
					'<br><span class="lc-bench-note">¿Crees que no es justo? Cuéntanoslo.</span></div>' +
				'</div>';
			agregarBloqueClassify( box, html );
		}

		/**
		 * Muestra/oculta el flujo manual de Morningstar (botón "Buscar en
		 * Morningstar" + Step 2 con inputs de alfa). Lo dejamos visible solo
		 * como fallback cuando el clasificador automático falla.
		 */
		function toggleFlujoManual( visible ) {
			var btn = document.querySelector( '#calculadora .calc-ms-btn' );
			if ( btn ) btn.style.display = visible ? '' : 'none';
			// Step 2 = el segundo .calc-step dentro de .calc-steps
			var steps = document.querySelectorAll( '#calculadora .calc-steps > .calc-step' );
			if ( steps && steps.length >= 2 ) {
				steps[1].style.display = visible ? '' : 'none';
			}
			// Las instrucciones intermedias entre los pasos: las identificamos
			// porque están dentro del primer .calc-step pero después del
			// .calc-fund-detected. Las ocultamos también porque dirigen al
			// flujo manual ya redundante.
			var firstStepContent = document.querySelector( '#calculadora .calc-steps > .calc-step:first-child .calc-step-content' );
			if ( firstStepContent ) {
				// Buscar bloques de texto con instrucciones (heurística: contienen "Riesgo" + "Alfa")
				var children = firstStepContent.children;
				for ( var i = 0; i < children.length; i++ ) {
					var c = children[i];
					if ( /Riesgo|Medidas de volatilidad/i.test( c.textContent || '' )
					  && ! c.classList.contains( 'liga-classify-result' )
					  && ! c.classList.contains( 'liga-classify-error' )
					  && ! c.classList.contains( 'liga-classify-loading' )
					  && ! c.classList.contains( 'calc-fund-detected' ) ) {
						c.style.display = visible ? '' : 'none';
					}
				}
			}
		}

		function agregarBloqueClassify( box, html ) {
			// Quita bloques anteriores y añade el nuevo
			var prev = box.querySelector( '.liga-classify-result, .liga-classify-error, .liga-classify-loading' );
			if ( prev ) prev.remove();
			box.insertAdjacentHTML( 'beforeend', html );
		}

		function dispararClassify() {
			var input = document.getElementById( 'calc-isin' );
			if ( ! input ) return;
			var isin = ( input.value || '' ).trim().toUpperCase();
			if ( ! isinValido( isin ) ) return;
			if ( isin === lastClassifiedIsin ) return;
			var box = document.getElementById( 'calc-fund-detected' );
			if ( ! box ) return;

			// Loading state inmediato
			agregarBloqueClassify(
				box,
				'<div class="liga-classify-loading">⏳ Calculando posición en la liga…</div>'
			);

			fetch( urlClassify( isin ) )
				.then( function ( r ) { return r.json(); } )
				.then( function ( data ) {
					var actual = ( document.getElementById( 'calc-isin' ).value || '' ).trim().toUpperCase();
					if ( actual !== isin ) return;
					lastClassifiedIsin = isin;
					pintarClassify( box, data );
				} )
				.catch( function ( e ) {
					console.warn( '[liga-fetcher] classify error', e );
					pintarClassify( box, { error: 'interno', detalle: 'fallo de red' } );
				} );
		}

		var input = document.getElementById( 'calc-isin' );
		if ( ! input ) return;

		input.addEventListener( 'input', function () {
			clearTimeout( debounceTimer );
			debounceTimer = setTimeout( dispararClassify, 700 );
		} );

		// Inyectar CSS mínimo para los bloques de classify
		var style = document.createElement( 'style' );
		style.textContent =
			'.liga-classify-loading { margin-top: 8px; padding: 8px 10px; background: rgba(255,255,255,0.05); border-radius: 6px; font-size: .85em; opacity: .8; }' +
			'.liga-classify-error { margin-top: 8px; padding: 10px 12px; background: rgba(220,50,50,0.15); border-left: 3px solid #c62828; border-radius: 4px; font-size: .85em; line-height: 1.4; }' +
			'.liga-classify-result { margin-top: 10px; padding: 10px 12px; background: rgba(29,78,216,0.12); border-left: 3px solid #1d4ed8; border-radius: 4px; font-size: .85em; line-height: 1.5; }' +
			'.liga-classify-result .lc-row { margin-bottom: 4px; }' +
			'.liga-classify-result .lc-zona { font-size: .9em; }' +
			'.liga-classify-result .lc-pos { color: #fff; font-weight: 700; }' +
			'.liga-classify-result .lc-zona-tag { font-weight: 600; }' +
			'.liga-classify-result .lc-bench { color: #aab; font-size: .78em; margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.08); }' +
			'.liga-classify-result .lc-bench-note { color: #889; font-style: italic; }' +
			'.liga-classify-result .lc-warn { color: #ffc107; background: rgba(255,193,7,0.08); border-left: 3px solid #ffc107; padding: 6px 10px; margin: 8px 0 4px; border-radius: 3px; font-size: .82em; line-height: 1.45; }';
		document.head.appendChild( style );
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', inicializar );
	} else {
		inicializar();
	}
} )();
