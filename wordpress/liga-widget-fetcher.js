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
		// Convencion DQ: raw POSITIVO = el fondo quema dinero al inversor (perdida).
		// raw NEGATIVO = el fondo bate al benchmark (ahorro). Mostramos el signo
		// que el lector espera ver: '+' para ahorro, '−' (U+2212) para perdida.
		var sign = n < 0 ? '+' : ( n > 0 ? '−' : '' );
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

		// Bajo la metodologia de alfa por ventana, cada DQ se calcula con la alfa
		// de su propia ventana (no con la historica proyectada). Si una ventana
		// no tiene cobertura suficiente, el DQ es null y mostramos "—" sin asterisco.
		// El asterisco "proyeccion" del render antiguo deja de tener sentido aqui.
		var dq3html = '<span class="' + dqClass( f.dq3 ) + '">' + fmtEur( f.dq3 ) + '</span>';
		var dq5html = '<span class="' + dqClass( f.dq5 ) + '">' + fmtEur( f.dq5 ) + '</span>';
		var dq10html = '<span class="' + dqClass( f.dq10 ) + '">' + fmtEur( f.dq10 ) + '</span>';

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
	 * Devuelve el HTML del indicador de tendencia (momentum ~30d del fondo vs índice):
	 *   ▼ verde   → mejora: baja en la Liga de la Basura (batió al índice ~30d)
	 *   ▲ rojo    → empeora: sube en la Liga de la Basura (peor que el índice ~30d)
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
			mejorando:  { glyph: '▼', color: '#2a9d3f', label: 'Mejorando: baja en la Liga de la Basura' },
			empeorando: { glyph: '▲', color: '#c62828', label: 'Empeorando: sube en la Liga de la Basura' },
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
		var conDatos = fondos.filter( function ( f ) { return f.dq3 != null && ! f.stale; } );
		var stale = fondos.filter( function ( f ) { return f.stale; } );
		// Ordenar conDatos descendente por dq3 (mayor = peor). Usamos dq3 (no dq5)
		// para que coincida con el ranking del motor: dq3 es la ventana que TODOS
		// los fondos tienen real, incluidos los de < 5 años. Las zonas (Champions…)
		// se derivan de esta posición de fila.
		conDatos.sort( function ( a, b ) { return ( b.dq3 || 0 ) - ( a.dq3 || 0 ); } );

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

	var MESES_ES = [ 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
		'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre' ];

	function actualizarFecha( generadoEn ) {
		var el = document.getElementById( DATE_EL_ID );
		if ( ! el ) return;
		try {
			var d = new Date( generadoEn );
			el.textContent = MESES_ES[ d.getUTCMonth() ] + ' ' + d.getUTCFullYear();
		} catch ( e ) {
			el.textContent = '';
		}
	}

	/**
	 * Banner de "Jornada de [mes] · [año]" — refuerza la metáfora de liga.
	 * Se inserta justo bajo el header del widget y muestra fecha exacta de
	 * la última actualización. Si falla todo, usa la fecha del cliente para
	 * que al menos el banner aparezca con algo razonable.
	 */
	function inyectarBannerJornada( generadoEnIso ) {
		if ( document.querySelector( '.liga-jornada-banner' ) ) return; // ya inyectado
		var header = document.querySelector( '.liga-wrapper .liga-header' );
		if ( ! header ) return;

		var fecha;
		try { fecha = new Date( generadoEnIso || Date.now() ); } catch ( e ) { fecha = new Date(); }
		var mes = MESES_ES[ fecha.getUTCMonth() ];
		var anyo = fecha.getUTCFullYear();
		var dia = fecha.getUTCDate();
		var fechaTxt = dia + ' de ' + mes + ' de ' + anyo;

		// Calcular jornada = (mes - mes_inicio) + 1, considerando enero 2026 como jornada 1.
		// Ajustable si el cliente quiere otra base.
		var jornadaIni = new Date( Date.UTC( 2026, 0, 1 ) ); // 1-ene-2026 = jornada 1
		var diffMs = fecha.getTime() - jornadaIni.getTime();
		var jornada = Math.max( 1, Math.floor( diffMs / ( 30.44 * 24 * 3600 * 1000 ) ) + 1 );

		var html =
			'<div class="liga-jornada-banner">' +
				'<div class="liga-jornada-left">' +
					'<div class="liga-jornada-titulo">🏆 Jornada ' + jornada + ' · ' + mes.charAt( 0 ).toUpperCase() + mes.slice( 1 ) + ' ' + anyo + '</div>' +
					'<div class="liga-jornada-sub">La clasificación se mueve cada mes con datos frescos</div>' +
				'</div>' +
				'<div class="liga-jornada-right">' +
					'<div class="liga-jornada-fecha-label">Última actualización</div>' +
					'<div class="liga-jornada-fecha-val">' + fechaTxt + '</div>' +
				'</div>' +
			'</div>';
		header.insertAdjacentHTML( 'afterend', html );
	}

	/**
	 * Tabs por zona en la tabla del ranking. Reduce drásticamente la densidad
	 * (25 filas a la vez en lugar de 100). Default activo: Champions de la
	 * Basura (la zona narrativamente más fuerte: los peores).
	 *
	 * Mecánica:
	 *   - Cada fila tiene rank 1..100 (data-orig-rank o .rank cell)
	 *   - 1-25 = Champions, 26-50 = Europa, 51-75 = Permanencia, 76-100 = Descenso
	 *   - Al cambiar tab, ocultamos las filas + zone-row separators de las
	 *     zonas no activas. La barra de filtros del eval(atob) sigue funcionando
	 *     dentro de la zona seleccionada.
	 */
	/**
	 * Wrapea window.applyFilters (definido por el eval(atob)) para que cualquier
	 * llamada posterior re-aplique también el filtro de zona activa. Sin esto,
	 * cada interacción con los filtros del widget resetea nuestro filtro de tab.
	 */
	function hookearApplyFilters() {
		if ( typeof window.applyFilters !== 'function' ) return;
		if ( window._epkOrigApplyFilters ) return; // ya hookeado
		window._epkOrigApplyFilters = window.applyFilters;
		window.applyFilters = function () {
			var ret = window._epkOrigApplyFilters.apply( this, arguments );
			if ( window._ligaZonaActiva ) {
				filtrarFilasPorZona( window._ligaZonaActiva.min, window._ligaZonaActiva.max );
			}
			return ret;
		};
	}

	function inyectarTabsZona() {
		if ( document.querySelector( '.liga-zonas-tabs' ) ) return;
		var tabla = document.getElementById( 'ranking-table' );
		if ( ! tabla ) return;

		var zonas = [
			{ id: 'champions',   label: 'Champions de la Basura', emoji: '🏆', desc: 'Los 25 fondos que más dinero queman',     min: 1,  max: 25 },
			{ id: 'europa',      label: 'Europa League',          emoji: '🔥', desc: 'Cuartil 2 — significativamente peores',   min: 26, max: 50 },
			{ id: 'permanencia', label: 'Zona Permanencia',       emoji: '😐', desc: 'Cuartil 3 — pierden poco contra el bench', min: 51, max: 75 },
			{ id: 'descenso',    label: 'Zona Descenso',          emoji: '📉', desc: 'Los 25 menos malos / mejores 25%',         min: 76, max: 100 }
		];

		var tabsHtml = '<div class="liga-zonas-tabs" role="tablist">';
		zonas.forEach( function ( z, i ) {
			tabsHtml += '<button class="liga-zona-tab' + ( i === 0 ? ' active' : '' ) + '"' +
				' data-zona="' + z.id + '"' +
				' data-min="' + z.min + '" data-max="' + z.max + '"' +
				' role="tab" aria-selected="' + ( i === 0 ? 'true' : 'false' ) + '"' +
				' title="' + escapeHtml( z.desc ) + '">' +
				'<span class="liga-zona-tab-emoji">' + z.emoji + '</span>' +
				'<span class="liga-zona-tab-label">' + escapeHtml( z.label ) + '</span>' +
				'<span class="liga-zona-tab-count">25</span>' +
				'</button>';
		} );
		tabsHtml += '</div>';

		// Insertamos la barra DENTRO del table-wrapper (.tw) para que la propia
		// tabla siga siendo el target principal y la barra se mantenga sticky.
		var tw = tabla.parentElement;
		if ( tw && tw.classList.contains( 'tw' ) ) {
			tw.insertAdjacentHTML( 'afterbegin', tabsHtml );
		} else {
			tabla.insertAdjacentHTML( 'beforebegin', tabsHtml );
		}

		// Bind clicks
		var btns = document.querySelectorAll( '.liga-zona-tab' );
		btns.forEach( function ( b ) {
			b.addEventListener( 'click', function () {
				btns.forEach( function ( x ) { x.classList.remove( 'active' ); x.setAttribute( 'aria-selected', 'false' ); } );
				b.classList.add( 'active' );
				b.setAttribute( 'aria-selected', 'true' );
				var min = parseInt( b.getAttribute( 'data-min' ), 10 );
				var max = parseInt( b.getAttribute( 'data-max' ), 10 );
				window._ligaZonaActiva = { min: min, max: max };
				// Reaplicar filtros principales antes de filtrar por zona
				if ( typeof window.applyFilters === 'function' ) {
					try { window.applyFilters(); } catch ( e ) {
						filtrarFilasPorZona( min, max );
					}
				} else {
					filtrarFilasPorZona( min, max );
				}
				// Scroll suave a la tabla para que el usuario vea el cambio
				var tabla = document.getElementById( 'ranking-table' );
				if ( tabla ) tabla.scrollIntoView( { behavior: 'smooth', block: 'start' } );
			} );
		} );

		// Estado inicial: Champions activo. Hookear applyFilters para que las
		// interacciones futuras (search, filtros gestora/tipo) respeten el tab.
		window._ligaZonaActiva = { min: 1, max: 25 };
		hookearApplyFilters();
		filtrarFilasPorZona( 1, 25 );
	}

	function filtrarFilasPorZona( min, max ) {
		var tbody = document.querySelector( '#ranking-table tbody' );
		if ( ! tbody ) return;
		Array.from( tbody.children ).forEach( function ( tr ) {
			// zone-row separators se ocultan siempre — el tab YA hace ese rol.
			if ( tr.classList && tr.classList.contains( 'zone-row' ) ) {
				tr.style.display = 'none';
				return;
			}
			// Stale (data-stale="1") = fondo sin datos suficientes para
			// clasificar. NO debe aparecer en NINGUNA zona — apareceria en
			// la ultima por mero artefacto de orden, no por merito.
			if ( tr.getAttribute( 'data-stale' ) === '1' ) {
				tr.style.display = 'none';
				return;
			}
			var rankCell = tr.querySelector( '.rank' );
			var rank = rankCell ? parseInt( rankCell.textContent, 10 ) : NaN;
			if ( isNaN( rank ) ) {
				tr.style.display = 'none';
				return;
			}
			tr.style.display = ( rank >= min && rank <= max ) ? '' : 'none';
		} );
	}

	/**
	 * Reemplaza el contenido de la calculadora compleja por un form simple
	 * de captura: ISIN + nombre + email. Auto-rellena el nombre del fondo
	 * cuando el ISIN es válido. Tras submit, redirige al informe vía email
	 * y muestra el link directo al informe en la propia página.
	 */
	function simplificarCalculadora() {
		var sec = document.querySelector( '#calculadora.calc-section' )
			|| document.querySelector( '.liga-wrapper .calc-section' );
		if ( ! sec ) return;
		if ( sec.getAttribute( 'data-simple' ) === '1' ) return; // ya simplificada
		sec.setAttribute( 'data-simple', '1' );

		sec.innerHTML =
			'<div class="liga-simple-form-wrap">' +
				'<h2 class="liga-simple-titulo">¿Quieres saber si tu fondo bate a la Cartera K10 Sectorial?</h2>' +
				'<p class="liga-simple-sub">Te enviamos un informe gratuito comparando tu fondo contra una cartera indexada sectorial equivalente. Verás CAGR, volatilidad, drawdown máximo y correlación, en 1 minuto.</p>' +
				'<form class="liga-simple-form" autocomplete="on">' +
					'<div class="lsf-field"><label for="lsf-isin">ISIN de tu fondo</label>' +
						'<input id="lsf-isin" name="isin" type="text" required maxlength="12" placeholder="Ej: ES0138861036" autocomplete="off" spellcheck="false" style="text-transform:uppercase">' +
						'<div class="lsf-fondo-info" aria-live="polite"></div>' +
					'</div>' +
					'<div class="lsf-field"><label for="lsf-email">Tu email</label>' +
						'<input id="lsf-email" name="email" type="email" required maxlength="180" placeholder="tu@email.com" autocomplete="email">' +
					'</div>' +
					'<button type="submit" class="lsf-submit">Enviarme el informe gratis</button>' +
					'<div class="lsf-priv">Sin spam. Te apuntas a la newsletter de El Proyecto K (+6.000 inversores). Te puedes desuscribir en 1 clic.</div>' +
					'<div class="lsf-status" role="status" aria-live="polite"></div>' +
				'</form>' +
			'</div>';

		bindSimpleForm( sec );
	}

	function bindSimpleForm( sec ) {
		var input = sec.querySelector( '#lsf-isin' );
		var info = sec.querySelector( '.lsf-fondo-info' );
		var form = sec.querySelector( '.liga-simple-form' );
		if ( ! input || ! form ) return;

		var nombreFondoCache = '';
		var lastIsin = '';
		var debounceTimer = null;

		function isinValido( s ) {
			return /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test( ( s || '' ).toUpperCase() );
		}

		function pintarFondoInfo( html, cls ) {
			info.className = 'lsf-fondo-info ' + ( cls || '' );
			info.innerHTML = html;
		}

		function lookupNombre() {
			var raw = ( input.value || '' ).trim().toUpperCase();
			input.value = raw;
			if ( raw === lastIsin ) return;
			lastIsin = raw;
			nombreFondoCache = '';
			info.innerHTML = '';
			if ( ! isinValido( raw ) ) return;

			// 1) Lookup local LIGA_ISIN
			if ( typeof window.LIGA_ISIN === 'object' && window.LIGA_ISIN[ raw ] ) {
				var f = window.LIGA_ISIN[ raw ];
				nombreFondoCache = f.n || '';
				pintarFondoInfo(
					'⚠️ <strong>' + escapeHtml( f.n ) + '</strong> ya está en La Liga (' + escapeHtml( f.b ) + '). Igualmente puedes recibir el informe.',
					'lsf-warn'
				);
				return;
			}

			// 2) Lookup vía /api/fund-name
			pintarFondoInfo( '⏳ Buscando fondo…', 'lsf-loading' );
			var url = ( typeof window !== 'undefined' && window.__LIGA_FUNDNAME_URL_OVERRIDE )
				|| 'https://backtesting-k.vercel.app/api/fund-name';
			fetch( url + '?isin=' + encodeURIComponent( raw ) )
				.then( function ( r ) { return r.json(); } )
				.then( function ( d ) {
					if ( ( input.value || '' ).trim().toUpperCase() !== raw ) return;
					if ( d && d.ok && d.name ) {
						nombreFondoCache = d.name;
						pintarFondoInfo( '✅ <strong>' + escapeHtml( d.name ) + '</strong>', 'lsf-ok' );
					} else {
						pintarFondoInfo( 'No encontramos ese fondo en nuestra base. Verifica el ISIN.', 'lsf-warn' );
					}
				} )
				.catch( function () {
					pintarFondoInfo( 'No pudimos verificar el fondo, pero puedes seguir.', 'lsf-warn' );
				} );
		}

		input.addEventListener( 'input', function () {
			clearTimeout( debounceTimer );
			debounceTimer = setTimeout( lookupNombre, 500 );
		} );

		form.addEventListener( 'submit', async function ( ev ) {
			ev.preventDefault();
			var isin = ( input.value || '' ).trim().toUpperCase();
			var email = ( form.querySelector( '#lsf-email' ).value || '' ).trim();
			var status = form.querySelector( '.lsf-status' );
			var submit = form.querySelector( '.lsf-submit' );

			if ( ! isinValido( isin ) ) {
				status.className = 'lsf-status lsf-err';
				status.textContent = 'El ISIN debe tener 12 caracteres (ej: ES0138861036).';
				return;
			}
			if ( ! email ) {
				status.className = 'lsf-status lsf-err';
				status.textContent = 'Introduce tu email.';
				return;
			}

			submit.disabled = true;
			status.className = 'lsf-status lsf-loading';
			status.textContent = '⏳ Generando tu informe…';

			try {
				var r = await fetch( urlLead(), {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify( {
						email: email, isin: isin,
						fondoNombre: nombreFondoCache || isin
					} )
				} );
				var data = await r.json();
				if ( r.ok && data.ok ) {
					form.classList.add( 'lsf-done' );
					status.className = 'lsf-status lsf-ok';
					status.innerHTML = '✅ Listo. Te hemos enviado el informe a <strong>' +
						escapeHtml( email ) + '</strong>.<br>' +
						'Llegará en 1-2 minutos. Si no lo ves, revisa la carpeta de Promociones o Spam.';
				} else {
					status.className = 'lsf-status lsf-err';
					status.textContent = data.error === 'email_invalido'
						? 'Ese email no parece válido.'
						: 'Hubo un problema. Inténtalo de nuevo en 1 minuto.';
					submit.disabled = false;
				}
			} catch ( err ) {
				status.className = 'lsf-status lsf-err';
				status.textContent = 'Sin conexión. Verifica tu red.';
				submit.disabled = false;
			}
		} );
	}

	/**
	 * Reduce densidad inicial: oculta los 2 charts grandes detrás de un toggle.
	 * El usuario los ve si quiere, pero no los recibe de golpe al aterrizar.
	 */
	function colapsarGraficos() {
		var grid = document.querySelector( '.liga-wrapper .charts-grid' );
		if ( ! grid ) return;
		if ( document.querySelector( '.liga-charts-toggle' ) ) return; // ya colapsado

		grid.style.display = 'none';
		grid.setAttribute( 'data-collapsed', '1' );

		var btn = document.createElement( 'button' );
		btn.className = 'liga-charts-toggle';
		btn.type = 'button';
		btn.innerHTML = '📊 Ver análisis gráfico detallado';
		btn.addEventListener( 'click', function () {
			var collapsed = grid.getAttribute( 'data-collapsed' ) === '1';
			if ( collapsed ) {
				grid.style.display = '';
				grid.setAttribute( 'data-collapsed', '0' );
				btn.innerHTML = '✕ Ocultar análisis gráfico';
			} else {
				grid.style.display = 'none';
				grid.setAttribute( 'data-collapsed', '1' );
				btn.innerHTML = '📊 Ver análisis gráfico detallado';
			}
		} );
		grid.insertAdjacentElement( 'beforebegin', btn );
	}

	/**
	 * Inyecta los estilos del banner y el toggle de gráficos. Idempotente.
	 */
	function inyectarEstilosLigaMedia() {
		if ( document.getElementById( 'liga-media-styles' ) ) return;
		var style = document.createElement( 'style' );
		style.id = 'liga-media-styles';
		style.textContent =
			'.liga-jornada-banner { background: linear-gradient(90deg, rgba(255,68,68,0.18), rgba(29,78,216,0.10)); border: 1px solid rgba(255,68,68,0.3); border-radius: 12px; padding: 18px 26px; margin: 0 0 28px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; }' +
			'.liga-jornada-titulo { font-size: 1.4em; font-weight: 700; color: #ff6b6b; line-height: 1.2; }' +
			'.liga-jornada-sub { font-size: .88em; color: #aab; margin-top: 4px; }' +
			'.liga-jornada-right { text-align: right; }' +
			'.liga-jornada-fecha-label { font-size: .72em; color: #888; text-transform: uppercase; letter-spacing: 1px; }' +
			'.liga-jornada-fecha-val { font-size: 1em; color: #e0e0e0; font-weight: 600; margin-top: 2px; }' +
			'@media (max-width: 600px) { .liga-jornada-right { text-align: left; } .liga-jornada-banner { padding: 14px 18px; } .liga-jornada-titulo { font-size: 1.15em; } }' +
			'.liga-charts-toggle { display: block; margin: 0 auto 24px; background: rgba(29,78,216,0.15); border: 1px solid rgba(29,78,216,0.45); color: #9ec1ff; padding: 11px 22px; border-radius: 8px; cursor: pointer; font-size: .95em; font-weight: 600; font-family: inherit; transition: background .15s, transform .1s; }' +
			'.liga-charts-toggle:hover { background: rgba(29,78,216,0.28); transform: translateY(-1px); }' +
			// Tabs por zona del ranking
			'.liga-zonas-tabs { display: flex; gap: 4px; margin-bottom: 14px; padding: 6px; background: rgba(15,15,30,0.7); border-radius: 10px; overflow-x: auto; flex-wrap: wrap; }' +
			'.liga-zona-tab { flex: 1 1 0; min-width: 140px; background: transparent; border: 1px solid transparent; color: #aab; padding: 12px 14px; border-radius: 7px; cursor: pointer; font-family: inherit; display: flex; flex-direction: column; gap: 2px; align-items: center; justify-content: center; transition: background .15s, color .15s, border-color .15s; }' +
			'.liga-zona-tab:hover { background: rgba(255,255,255,0.04); color: #e0e0e0; }' +
			'.liga-zona-tab.active { background: rgba(255,68,68,0.15); border-color: rgba(255,68,68,0.4); color: #fff; }' +
			'.liga-zona-tab-emoji { font-size: 1.2em; line-height: 1; }' +
			'.liga-zona-tab-label { font-size: .82em; font-weight: 600; line-height: 1.2; text-align: center; }' +
			'.liga-zona-tab-count { font-size: .68em; color: inherit; opacity: .7; font-weight: 500; }' +
			'@media (max-width: 600px) { .liga-zona-tab-label { font-size: .72em; } .liga-zona-tab { min-width: 90px; padding: 10px 6px; } }' +
			// Form simplificado de captura (reemplaza la calculadora compleja)
			'.liga-simple-form-wrap { padding: 24px 20px; }' +
			'.liga-simple-titulo { color: #ff6b6b; font-size: 1.45em; font-weight: 700; line-height: 1.25; margin: 0 0 10px; }' +
			'.liga-simple-sub { color: #c5c8d0; font-size: .95em; line-height: 1.55; margin: 0 0 22px; }' +
			'.liga-simple-form .lsf-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }' +
			'.liga-simple-form .lsf-field label { font-size: .78em; color: #aab; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }' +
			'.liga-simple-form input { background: rgba(15,15,30,0.85); color: #e8e8ec; border: 1px solid rgba(255,255,255,0.18); padding: 12px 14px; border-radius: 8px; font-size: 1em; font-family: inherit; transition: border-color .15s, box-shadow .15s; }' +
			'.liga-simple-form input:focus { border-color: #ff6b6b; outline: none; box-shadow: 0 0 0 3px rgba(255,107,107,0.2); }' +
			'.liga-simple-form input::placeholder { color: #555; }' +
			'.liga-simple-form .lsf-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }' +
			'.liga-simple-form .lsf-fondo-info { font-size: .9em; line-height: 1.4; min-height: 1.4em; padding: 4px 0; }' +
			'.liga-simple-form .lsf-fondo-info.lsf-ok { color: #6bcf7f; }' +
			'.liga-simple-form .lsf-fondo-info.lsf-warn { color: #ffb74d; }' +
			'.liga-simple-form .lsf-fondo-info.lsf-loading { color: #aab; }' +
			'.liga-simple-form .lsf-submit { width: 100%; background: linear-gradient(135deg, #ff4444, #ff6b6b); color: #fff; border: none; padding: 14px 24px; border-radius: 8px; font-weight: 700; font-size: 1em; cursor: pointer; transition: transform .1s, box-shadow .15s; font-family: inherit; margin-top: 8px; }' +
			'.liga-simple-form .lsf-submit:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(255,68,68,0.4); }' +
			'.liga-simple-form .lsf-submit:disabled { opacity: .55; cursor: not-allowed; }' +
			'.liga-simple-form .lsf-priv { font-size: .75em; color: #888; margin-top: 12px; line-height: 1.5; text-align: center; }' +
			'.liga-simple-form .lsf-status { margin-top: 14px; font-size: .9em; line-height: 1.5; padding: 10px 12px; border-radius: 6px; }' +
			'.liga-simple-form .lsf-status:empty { display: none; }' +
			'.liga-simple-form .lsf-status.lsf-loading { color: #aab; background: rgba(255,255,255,0.04); }' +
			'.liga-simple-form .lsf-status.lsf-ok { color: #6bcf7f; background: rgba(42,157,63,0.12); border-left: 3px solid #2a9d3f; }' +
			'.liga-simple-form .lsf-status.lsf-err { color: #ff8888; background: rgba(220,50,50,0.12); border-left: 3px solid #c62828; }' +
			'.liga-simple-form .lsf-link-informe { display: inline-block; margin-top: 8px; color: #4caf50; font-weight: 700; text-decoration: underline; }' +
			'.liga-simple-form.lsf-done .lsf-field, .liga-simple-form.lsf-done .lsf-row, .liga-simple-form.lsf-done .lsf-submit, .liga-simple-form.lsf-done .lsf-priv { display: none; }' +
			'@media (max-width: 600px) { .liga-simple-form .lsf-row { grid-template-columns: 1fr; } .liga-simple-titulo { font-size: 1.2em; } }';
		document.head.appendChild( style );
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

	/* ---------------------------------------------------------------------------
	 * renderDashboard(): regenera KPIs + mobile-hero + tarjetas + scatter + treemap
	 * desde el snapshot, para que el dashboard NO se desincronice de la tabla.
	 * Convencion de pantalla: valor mostrado = -dq10 (quemar = negativo).
	 * ------------------------------------------------------------------------- */
	function dashEsc( s ) { return String( s ).replace( /&/g, '&amp;' ).replace( /</g, '&lt;' ); }
	function dashMiles( n ) {
		var s = Math.round( Math.abs( n ) ).toString();
		if ( Math.abs( n ) >= 10000 ) s = s.replace( /\B(?=(\d{3})+(?!\d))/g, '.' );
		return ( n < 0 ? '-' : '' ) + s;
	}
	function kEur( v ) { return ( v < 0 ? '\u2212' : '+' ) + Math.round( Math.abs( v ) / 1000 ) + 'K \u20ac'; }
	function kEurTight( v ) { return ( v < 0 ? '\u2212' : '+' ) + Math.round( Math.abs( v ) / 1000 ) + 'K\u20ac'; }
	function tmVal( v ) { return ( v < 0 ? '-' : '+' ) + Math.round( Math.abs( v ) / 1000 ) + 'K\u20ac'; }
	function dashMill( v ) { return ( v / 1e6 ).toFixed( 1 ).replace( '.', ',' ); }

	function setStatVal( label, val, green ) {
		var stats = document.querySelectorAll( '.stats .stat' );
		for ( var i = 0; i < stats.length; i++ ) {
			var lab = stats[ i ].querySelector( '.label' );
			if ( lab && lab.textContent.trim() === label ) {
				var v = stats[ i ].querySelector( '.val' );
				if ( v ) { v.textContent = val; if ( green ) { v.classList.add( 'green' ); } else { v.classList.remove( 'green' ); } }
				return;
			}
		}
	}
	function dashSetText( sel, txt ) { var e = document.querySelector( sel ); if ( e ) { e.textContent = txt; } }

	function buildScatterSVG( f ) {
		var X0 = 70, X1 = 670, Y0 = 30, Y1 = 345, terMax = 3.5, dTop = -90000, dBot = 240000;
		function cx( t ) { return X0 + Math.min( t, terMax ) / terMax * ( X1 - X0 ); }
		function cy( d ) { return Math.max( Y0, Math.min( Y1, Y0 + ( d - dTop ) / ( dBot - dTop ) * ( Y1 - Y0 ) ) ); }
		var s = '<svg viewBox="0 0 700 400" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:700px;height:auto"><rect width="700" height="400" fill="#1a1a2e" rx="8"/><defs><style>text{font-family:-apple-system,sans-serif}</style></defs>';
		var ylab = [ [ 345, '+240K' ], [ 282, '+174K' ], [ 219, '+108K' ], [ 156, '+42K' ], [ 93, '-24K' ], [ 30, '-90K' ] ];
		ylab.forEach( function ( p ) { s += '<line x1="70" y1="' + p[0] + '" x2="670" y2="' + p[0] + '" stroke="#2d2d4a" stroke-width="1"/><text x="62" y="' + ( p[0] + 4 ) + '" fill="#888" font-size="10" text-anchor="end">' + p[1] + '</text>'; } );
		for ( var i = 0; i <= 7; i++ ) { var x = 70 + i * 0.5 / 3.5 * 600; s += '<line x1="' + x + '" y1="30" x2="' + x + '" y2="345" stroke="#2d2d4a" stroke-width="1"/><text x="' + x + '" y="363" fill="#888" font-size="10" text-anchor="middle">' + ( i * 0.5 ).toFixed( 1 ) + '%</text>'; }
		var yz = cy( 0 ); s += '<line x1="70" y1="' + yz + '" x2="670" y2="' + yz + '" stroke="#555" stroke-width="1" stroke-dasharray="4,4"/><text x="674" y="' + ( yz + 3 ) + '" fill="#888" font-size="9">0</text>';
		s += '<text x="370" y="392" fill="#a0a0a0" font-size="12" text-anchor="middle">TER (%)</text><text x="15" y="187.5" fill="#a0a0a0" font-size="12" text-anchor="middle" transform="rotate(-90,15,187.5)">Dinero Quemado 10A (\u20ac)</text><text x="370" y="18" fill="#ff8888" font-size="13" font-weight="600" text-anchor="middle">TER vs Dinero Quemado (10 a\u00f1os)</text>';
		f.forEach( function ( x ) { var b = x.tipo === 'Bancario'; s += '<circle cx="' + cx( x.ter ).toFixed( 1 ) + '" cy="' + cy( -x.dq10 ).toFixed( 1 ) + '" r="5" fill="' + ( b ? '#ff6b6b' : '#81c784' ) + '" opacity="' + ( b ? '0.8' : '0.85' ) + '"><title>' + dashEsc( x.nombre ) + '\nTER: ' + x.ter.toFixed( 2 ) + '% | DQ: ' + dashMiles( x.dq10 ) + '\u20ac</title></circle>'; } );
		s += '<circle cx="80" cy="42" r="5" fill="#ff6b6b" opacity="0.8"/><text x="90" y="46" fill="#a0a0a0" font-size="10">Bancario</text><circle cx="160" cy="42" r="5" fill="#81c784" opacity="0.85"/><text x="170" y="46" fill="#a0a0a0" font-size="10">Independiente</text></svg>';
		return s;
	}
	function dashSquarify( items, x, y, w, h ) {
		items = items.slice(); var out = []; var tot = items.reduce( function ( s, i ) { return s + i._a; }, 0 ) || 1; var sc = ( w * h ) / tot;
		items.forEach( function ( i ) { i._s = i._a * sc; } );
		function worst( r, l ) { var s = r.reduce( function ( a, b ) { return a + b._s; }, 0 ); var mx = Math.max.apply( null, r.map( function ( z ) { return z._s; } ) ); var mn = Math.min.apply( null, r.map( function ( z ) { return z._s; } ) ); return Math.max( l * l * mx / ( s * s ), s * s / ( l * l * mn ) ); }
		var X = x, Y = y, W = w, H = h, row = [];
		while ( items.length ) { var l = Math.min( W, H ); if ( ! row.length ) { row.push( items.shift() ); continue; } var it = items[0]; if ( worst( row, l ) >= worst( row.concat( it ), l ) ) { row.push( items.shift() ); } else { lay( row, X, Y, W, H ); var u = row.reduce( function ( a, b ) { return a + b._s; }, 0 ) / l; if ( W <= H ) { Y += u; H -= u; } else { X += u; W -= u; } row = []; } }
		if ( row.length ) { lay( row, X, Y, W, H ); }
		function lay( r, X, Y, W, H ) { var s = r.reduce( function ( a, b ) { return a + b._s; }, 0 ); var l = Math.min( W, H ); var th = s / l; var o = 0; r.forEach( function ( z ) { var le = z._s / th; if ( W <= H ) { out.push( { x: X + o, y: Y, w: le, h: th, item: z } ); o += le; } else { out.push( { x: X, y: Y + o, w: th, h: le, item: z } ); o += le; } } ); }
		return out;
	}
	function buildTreemapSVG( f ) {
		var byG = {}; f.forEach( function ( x ) { var g = byG[ x.gestora ] || ( byG[ x.gestora ] = { v: 0, n: 0, b: x.tipo === 'Bancario' } ); g.v += -( x.dq10 || 0 ); g.n++; } );
		var arr = Object.keys( byG ).map( function ( g ) { var o = byG[ g ]; return { g: g, v: o.v, n: o.n, b: o.b, _a: Math.abs( o.v ) || 1 }; } ).sort( function ( a, b ) { return b._a - a._a; } );
		if ( ! arr.length ) { return ''; }
		var maxA = arr[0]._a || 1;
		var rects = dashSquarify( arr, 30, 40, 638, 287 );
		var s = '<svg viewBox="0 0 700 360" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:700px;height:auto"><rect width="700" height="360" fill="#1a1a2e" rx="8"/><defs><style>text{font-family:-apple-system,sans-serif}</style></defs><text x="350" y="22" fill="#ff8888" font-size="13" font-weight="600" text-anchor="middle">Dinero Quemado por Gestora (10 a\u00f1os)</text>';
		rects.forEach( function ( r ) { var it = r.item, t = it._a / maxA, fill;
			if ( it.b ) { var rr = Math.round( 196 + 59 * t ), gb = Math.round( 69 - 39 * t ); fill = 'rgb(' + rr + ',' + gb + ',' + gb + ')'; }
			else { fill = 'rgba(129,199,132,' + ( 0.3 + 0.6 * t ).toFixed( 2 ) + ')'; }
			s += '<rect x="' + r.x.toFixed( 1 ) + '" y="' + r.y.toFixed( 1 ) + '" width="' + r.w.toFixed( 1 ) + '" height="' + r.h.toFixed( 1 ) + '" fill="' + fill + '" rx="3" stroke="#1a1a2e" stroke-width="2"><title>' + dashEsc( it.g ) + ': ' + tmVal( it.v ) + ' (' + it.n + ' fondos)</title></rect>';
			if ( r.w > 40 && r.h > 22 ) { var mx = ( r.x + r.w / 2 ).toFixed( 1 ), my = ( r.y + r.h / 2 ); s += '<text x="' + mx + '" y="' + ( my - 2 ).toFixed( 1 ) + '" fill="#fff" font-size="10" font-weight="600" text-anchor="middle">' + dashEsc( it.g ) + '</text><text x="' + mx + '" y="' + ( my + 12 ).toFixed( 1 ) + '" fill="rgba(255,255,255,0.7)" font-size="9" text-anchor="middle">' + tmVal( it.v ) + '</text>'; } } );
		s += '</svg>'; return s;
	}
	function replaceChart( titleText, svg ) {
		var svgs = document.querySelectorAll( '.chart-card svg' );
		for ( var i = 0; i < svgs.length; i++ ) {
			if ( svgs[ i ].textContent.indexOf( titleText ) >= 0 ) { svgs[ i ].parentNode.innerHTML = svg; return true; }
		}
		return false;
	}
	function renderDashboard( fondos ) {
		try {
			var disp = function ( f ) { return -( f.dq10 || 0 ); };
			var disps = fondos.map( disp );
			var peor = Math.min.apply( null, disps ), mejor = Math.max.apply( null, disps );
			var bancos = fondos.filter( function ( f ) { return f.tipo === 'Bancario'; } );
			var indeps = fondos.filter( function ( f ) { return f.tipo !== 'Bancario'; } );
			var avgTer = function ( a ) { return a.length ? a.reduce( function ( s, f ) { return s + ( f.ter || 0 ); }, 0 ) / a.length : 0; };
			var terB = avgTer( bancos ), terI = avgTer( indeps );
			var difPct = terI ? Math.round( ( terB / terI - 1 ) * 100 ) : 0;
			var burned = function ( f ) { return Math.max( f.dq10 || 0, 0 ); };
			var totalBurn = fondos.reduce( function ( s, f ) { return s + burned( f ); }, 0 );
			var bankBurn = bancos.reduce( function ( s, f ) { return s + burned( f ); }, 0 );
			var bankShare = totalBurn ? Math.round( bankBurn / totalBurn * 100 ) : 0;

			setStatVal( 'Fondos Analizados', String( fondos.length ), false );
			setStatVal( 'Peor Fondo (10A)', kEur( peor ), peor >= 0 );
			setStatVal( 'Mejor Fondo (10A)', kEur( mejor ), mejor >= 0 );

			dashSetText( '.mobile-hero .mh-big', dashMill( totalBurn ) + ' M\u20ac' );
			dashSetText( '.mobile-hero .mh-sub', 'El ' + bankShare + '% lo queman los fondos bancarios' );
			var mhStats = document.querySelectorAll( '.mobile-hero .mh-stat .mh-stat-val' );
			if ( mhStats[0] ) { mhStats[0].textContent = terB.toFixed( 2 ).replace( '.', ',' ) + '%'; }
			if ( mhStats[1] ) { mhStats[1].textContent = terI.toFixed( 2 ).replace( '.', ',' ) + '%'; }
			if ( mhStats[2] ) { mhStats[2].textContent = kEurTight( peor ); }

			dashSetText( '.dashboard .dash-big', '\u20ac' + dashMill( totalBurn ) + ' Millones' );
			var segBank = document.querySelector( '.dashboard .seg-bank' ); if ( segBank ) { segBank.style.width = bankShare + '%'; }
			var segIndep = document.querySelector( '.dashboard .seg-indep' ); if ( segIndep ) { segIndep.style.width = ( 100 - bankShare ) + '%'; }
			var legSpans = document.querySelectorAll( '.progress-legend > span' );
			if ( legSpans[0] ) { legSpans[0].innerHTML = '<span class="dot dot-bank"></span>Bancarios ' + bankShare + '%'; }
			if ( legSpans[1] ) { legSpans[1].innerHTML = '<span class="dot dot-indep"></span>Independientes ' + ( 100 - bankShare ) + '%'; }
			var terVals = document.querySelectorAll( '.ter-compare .ter-val' );
			if ( terVals[0] ) { terVals[0].textContent = terB.toFixed( 2 ) + '%'; }
			if ( terVals[1] ) { terVals[1].textContent = terI.toFixed( 2 ) + '%'; }
			dashSetText( '.ter-diff', 'Los bancarios cobran un ' + difPct + '% m\u00e1s en comisiones' );

			dashSetText( '.tagline', bancos.length + ' fondos bancarios y ' + indeps.length + ' fondos de gestoras independientes analizados' );

			replaceChart( 'TER vs Dinero Quemado', buildScatterSVG( fondos ) );
			replaceChart( 'Dinero Quemado por Gestora', buildTreemapSVG( fondos ) );
		} catch ( e ) { console.warn( '[liga-fetcher] renderDashboard fallo:', e ); }
	}

	function inicializar() {
		// Liga Media: estilos + toggle gráficos no dependen del snapshot, los
		// aplicamos cuanto antes para que el render inicial ya sea menos denso.
		inyectarEstilosLigaMedia();
		colapsarGraficos();
		simplificarCalculadora();

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
				renderDashboard( snap.fondos );
				actualizarFecha( snap.generadoEn );
				inyectarBannerJornada( snap.generadoEn );
				inyectarTabsZona();
				aplicarFiltrosSeguro();
				setStatus( '' );
			} )
			.catch( function ( err ) {
				console.warn( '[liga-fetcher] usando datos hardcoded como fallback:', err );
				// Aunque falle el snapshot, mostramos el banner + tabs con datos
				// hardcoded del HTML embebido. Al menos la UX no degrada.
				inyectarBannerJornada( null );
				inyectarTabsZona();
				setStatus( '' );
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
	var LEAD_URL = ( typeof window !== 'undefined' && window.__LIGA_LEAD_URL_OVERRIDE )
		|| '/api/lead/migracion';
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

	function urlLead() {
		var base = VERCEL_BASE || '';
		var path = LEAD_URL;
		if ( path.charAt( 0 ) === '/' && base ) path = base + path;
		return path;
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
					msg = 'No tenemos histórico suficiente de este fondo en nuestra base de datos. ' +
						'Esto suele pasar con fondos muy nuevos o poco transparentes — ya es una primera mala señal.';
				} else if ( datos && datos.error === 'no_morningstar' ) {
					msg = 'No encontramos este fondo en Morningstar. Verifica el ISIN.';
				} else if ( datos && datos.error === 'rango_corto' ) {
					msg = 'Este fondo lleva menos de 1 año cotizando — no podemos calcular su alfa todavía.';
				} else {
					msg = 'No pudimos clasificarlo automáticamente: ' + det;
				}
				// Aunque el classify falle, ofrecer el form de captura — el user
				// igualmente puede pedir el plan de migración para su fondo.
				var datosParciales = datosParcialesDesdeFondo( datos );
				var formHtml = datosParciales ? renderFormLead( datosParciales, true ) : '';
				agregarBloqueClassify( box, '<div class="liga-classify-error">' + escapeHtml( msg ) + '</div>' + formHtml );
				if ( datosParciales ) bindFormLead( box, datosParciales );
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

			// Estado inicial del fondo: ¿el usuario "pierde" o "gana" frente al benchmark?
			// Usamos dq5 como referencia. Si dq5 > 0 -> el fondo quema dinero.
			var perdiendo = ( datos.dq5 != null && datos.dq5 > 0 ) || ( datos.alfa != null && datos.alfa < 0 );

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
				'</div>' +
				renderFormLead( datos, perdiendo );
			agregarBloqueClassify( box, html );
			bindFormLead( box, datos );
		}

		/**
		 * Construye datos parciales aprovechando lo que detectFund haya puesto
		 * en el DOM cuando el classify falla. Permite renderizar el form aunque
		 * la clasificación contra la liga no haya tenido éxito.
		 */
		function datosParcialesDesdeFondo() {
			var input = document.getElementById( 'calc-isin' );
			var isin = ( ( input && input.value ) || '' ).trim().toUpperCase();
			if ( ! isinValido( isin ) ) return null;
			var nameEl = document.querySelector( '.calc-fund-detected .fund-name' );
			// Si LIGA_ISIN local lo tiene, usamos ese nombre. Si no, lo que detectFund haya puesto.
			var nombre = '';
			if ( typeof window.LIGA_ISIN === 'object' && window.LIGA_ISIN[ isin ] ) {
				nombre = window.LIGA_ISIN[ isin ].n || '';
			} else if ( nameEl ) {
				nombre = nameEl.textContent.trim();
			}
			return { isin: isin, nombre: nombre, dq5: null, alfa: null };
		}

		/**
		 * Form de captura de lead: tras ver el alfa de su fondo, le ofrecemos
		 * el plan de migración personalizado a su alternativa indexada por email.
		 * Se renderiza siempre dentro del bloque classify-result.
		 */
		function renderFormLead( datos, perdiendo ) {
			var titular = perdiendo
				? '¿Quieres saber a qué fondo indexado migrar para dejar de perder dinero?'
				: '¿Quieres ver el análisis completo y la mejor alternativa indexada para tu fondo?';
			var subtitular = perdiendo
				? 'Te enviamos un plan paso a paso por email: alternativa indexada equivalente, cómo hacer el traspaso sin pagar a Hacienda, y el ahorro proyectado a 10 años.'
				: 'Te enviamos un análisis comparativo por email: alternativa indexada equivalente, costes ocultos, y proyección a 10 años.';
			return (
				'<form class="liga-lead-form" data-isin="' + escapeHtml( datos.isin || '' ) +
					'" data-fondo="' + escapeHtml( datos.nombre || '' ) + '">' +
					'<div class="ll-titular">' + escapeHtml( titular ) + '</div>' +
					'<div class="ll-sub">' + escapeHtml( subtitular ) + '</div>' +
					'<div class="ll-grid">' +
						'<input type="text" class="ll-input ll-nombre" name="nombre" placeholder="Tu nombre" required maxlength="80" autocomplete="given-name">' +
						'<input type="email" class="ll-input ll-email" name="email" placeholder="Tu email" required maxlength="180" autocomplete="email">' +
						'<button type="submit" class="ll-submit">Recibir plan gratis</button>' +
					'</div>' +
					'<div class="ll-priv">Sin spam. Te apuntas a la newsletter de El Proyecto K (+6.000 inversores). Te puedes desuscribir en 1 clic.</div>' +
					'<div class="ll-status" role="status" aria-live="polite"></div>' +
				'</form>'
			);
		}

		function bindFormLead( box, datos ) {
			var form = box.querySelector( '.liga-lead-form' );
			if ( ! form ) return;
			form.addEventListener( 'submit', async function ( ev ) {
				ev.preventDefault();
				var nombre = form.querySelector( '.ll-nombre' ).value.trim();
				var email = form.querySelector( '.ll-email' ).value.trim();
				var status = form.querySelector( '.ll-status' );
				var submitBtn = form.querySelector( '.ll-submit' );
				if ( ! nombre || ! email ) {
					status.className = 'll-status ll-err';
					status.textContent = 'Completa nombre y email.';
					return;
				}
				status.className = 'll-status ll-loading';
				status.textContent = '⏳ Enviando…';
				submitBtn.disabled = true;
				try {
					var r = await fetch( urlLead(), {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify( {
							nombre: nombre,
							email: email,
							isin: datos.isin || form.dataset.isin || '',
							fondoNombre: datos.nombre || form.dataset.fondo || ''
						} )
					} );
					var data = await r.json();
					if ( r.ok && data.ok ) {
						form.classList.add( 'll-done' );
						status.className = 'll-status ll-ok';
						// El informe se hospeda en Vercel — el lead recibe email pero
						// ademas le mostramos el link directo aqui para verlo ya.
						// Pasamos el nombre del fondo por URL para evitar lookup
						// adicional a Morningstar en la pagina del informe.
						var isinUsuario = datos.isin || form.dataset.isin || '';
						var nombreFondo = datos.nombre || form.dataset.fondo || '';
						var vercelBase = ( typeof window !== 'undefined' && window.__LIGA_VERCEL_BASE )
							|| 'https://backtesting-k.vercel.app';
						var informeUrl = '';
						if ( isinUsuario ) {
							informeUrl = vercelBase + '/informe/' + encodeURIComponent( isinUsuario );
							if ( nombreFondo ) informeUrl += '?nombre=' + encodeURIComponent( nombreFondo );
						}
						status.innerHTML = '✅ Apuntado, ' + escapeHtml( nombre ) + '. Te hemos enviado el informe a ' +
							escapeHtml( email ) + '.' +
							( informeUrl
								? ' <br><a href="' + informeUrl + '" target="_blank" rel="noopener" style="color:#4caf50;font-weight:700;text-decoration:underline">Ver informe ahora →</a>'
								: '' );
					} else {
						status.className = 'll-status ll-err';
						status.textContent = data.error === 'email_invalido'
							? 'Ese email no parece válido — comprueba la dirección.'
							: 'Hubo un problema enviándote el plan. Inténtalo de nuevo en un minuto.';
						submitBtn.disabled = false;
					}
				} catch ( err ) {
					status.className = 'll-status ll-err';
					status.textContent = 'Sin conexión. Verifica tu red e inténtalo de nuevo.';
					submitBtn.disabled = false;
				}
			} );
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

		// Inyectar CSS mínimo para los bloques de classify + form de lead
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
			'.liga-classify-result .lc-warn { color: #ffc107; background: rgba(255,193,7,0.08); border-left: 3px solid #ffc107; padding: 6px 10px; margin: 8px 0 4px; border-radius: 3px; font-size: .82em; line-height: 1.45; }' +
			// Form de captura de lead (Beehiiv)
			'.liga-lead-form { margin-top: 14px; padding: 16px 18px; background: linear-gradient(135deg, rgba(255,68,68,0.12), rgba(29,78,216,0.10)); border: 1px solid rgba(255,68,68,0.35); border-radius: 10px; }' +
			'.liga-lead-form.ll-done { background: rgba(42,157,63,0.12); border-color: rgba(42,157,63,0.45); }' +
			'.liga-lead-form .ll-titular { font-size: 1.05em; font-weight: 700; color: #ff8a8a; line-height: 1.3; margin-bottom: 6px; }' +
			'.liga-lead-form.ll-done .ll-titular { color: #4caf50; }' +
			'.liga-lead-form .ll-sub { font-size: .85em; color: #c5c8d0; line-height: 1.5; margin-bottom: 12px; }' +
			'.liga-lead-form .ll-grid { display: grid; grid-template-columns: 1fr 1fr auto; gap: 10px; align-items: stretch; }' +
			'.liga-lead-form .ll-input { background: rgba(15,15,30,0.8); color: #e8e8ec; border: 1px solid rgba(255,255,255,0.18); padding: 11px 14px; border-radius: 7px; font-size: .95em; font-family: inherit; transition: border-color .15s, box-shadow .15s; }' +
			'.liga-lead-form .ll-input:focus { border-color: #ff6b6b; outline: none; box-shadow: 0 0 0 3px rgba(255,107,107,0.18); }' +
			'.liga-lead-form .ll-input::placeholder { color: #777; }' +
			'.liga-lead-form .ll-submit { background: linear-gradient(135deg, #ff4444, #ff6b6b); color: #fff; border: none; padding: 11px 22px; border-radius: 7px; font-weight: 700; font-size: .92em; cursor: pointer; transition: transform .1s, box-shadow .15s; font-family: inherit; white-space: nowrap; }' +
			'.liga-lead-form .ll-submit:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(255,68,68,0.35); }' +
			'.liga-lead-form .ll-submit:disabled { opacity: .55; cursor: not-allowed; }' +
			'.liga-lead-form .ll-priv { font-size: .72em; color: #888; margin-top: 8px; line-height: 1.45; }' +
			'.liga-lead-form .ll-status { margin-top: 10px; font-size: .85em; line-height: 1.4; }' +
			'.liga-lead-form .ll-status.ll-loading { color: #aab; }' +
			'.liga-lead-form .ll-status.ll-ok { color: #6bcf7f; font-weight: 600; }' +
			'.liga-lead-form .ll-status.ll-err { color: #ff8888; }' +
			'.liga-lead-form.ll-done .ll-grid, .liga-lead-form.ll-done .ll-priv, .liga-lead-form.ll-done .ll-sub { display: none; }' +
			'@media (max-width: 600px) { .liga-lead-form .ll-grid { grid-template-columns: 1fr; } }';
		document.head.appendChild( style );
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', inicializar );
	} else {
		inicializar();
	}
} )();
