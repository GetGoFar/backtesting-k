/* =============================================================================
 * Liga de Fondos Basura — Snapshot fetcher
 * =============================================================================
 *
 * Pega este script en el widget HTML de Elementor de la página
 * /liga-fondos-basura/, en un nuevo bloque <script> AL FINAL del widget
 * (justo antes del </script> de cierre del eval(atob)).
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
			mejorando:  { glyph: '▲', color: '#2a9d3f', label: 'Mejorando vs semana anterior' },
			empeorando: { glyph: '▼', color: '#c62828', label: 'Empeorando vs semana anterior' },
			estable:    { glyph: '=', color: '#888',    label: 'Estable vs semana anterior' },
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
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', inicializar );
	} else {
		inicializar();
	}
} )();
