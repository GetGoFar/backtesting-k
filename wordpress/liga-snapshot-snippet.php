<?php
/**
 * WPCode snippet: Liga de Fondos Basura — Snapshot API
 * --------------------------------------------------------
 * Crear como nuevo snippet en WPCode (PHP, "Run everywhere").
 *
 * Endpoints:
 *   GET  /wp-json/epk/v1/liga-snapshot    -> snapshot (publico)
 *   POST /wp-json/epk/v1/liga-snapshot    -> guarda snapshot (requiere token)
 *
 * AUTENTICACION del POST:
 *   Application Passwords esta deshabilitado en este WP. Tampoco usamos
 *   Basic Auth porque WordPress lo intercepta antes del permission_callback
 *   y devuelve rest_forbidden cuando no hay App Passwords activo.
 *
 *   Usamos un header custom: X-Liga-Token: <token>
 *   Compara con un token estatico (no en wp_options para evitar autoload).
 *   En el repo el token se sustituye por __REPLACE_ME__.
 *
 *   En Vercel: el codigo de refresh envia el header X-Liga-Token con el
 *   valor de WP_LIGA_TOKEN (env var).
 */

add_action( 'rest_api_init', function () {

	register_rest_route( 'epk/v1', '/liga-snapshot', array(
		'methods'             => 'GET',
		'callback'            => 'epk_liga_snapshot_get',
		'permission_callback' => '__return_true',
	) );

	register_rest_route( 'epk/v1', '/liga-snapshot', array(
		'methods'             => 'POST',
		'callback'            => 'epk_liga_snapshot_post',
		'permission_callback' => function ( WP_REST_Request $request ) {
			$expected = '__REPLACE_ME__';
			$got = $request->get_header( 'x_liga_token' );
			if ( ! $got ) $got = $request->get_header( 'x-liga-token' );
			if ( ! $got || strlen( $got ) < 16 ) return false;
			return hash_equals( $expected, $got );
		},
	) );
} );

function epk_liga_snapshot_get( WP_REST_Request $request ) {
	$snapshot = get_option( 'epk_liga_snapshot' );
	if ( empty( $snapshot ) ) {
		return new WP_Error( 'no_snapshot', 'Snapshot no disponible todavia', array( 'status' => 503 ) );
	}
	$response = new WP_REST_Response( $snapshot, 200 );
	$response->header( 'Cache-Control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400' );
	return $response;
}

function epk_liga_snapshot_post( WP_REST_Request $request ) {
	$body = $request->get_json_params();

	if ( ! is_array( $body ) ) {
		return new WP_Error( 'bad_payload', 'Body no es JSON valido', array( 'status' => 400 ) );
	}
	if ( empty( $body['fondos'] ) || ! is_array( $body['fondos'] ) ) {
		return new WP_Error( 'bad_payload', 'Falta el array fondos', array( 'status' => 400 ) );
	}
	if ( count( $body['fondos'] ) < 50 || count( $body['fondos'] ) > 500 ) {
		return new WP_Error( 'bad_payload', 'Cantidad de fondos fuera de rango razonable', array( 'status' => 400 ) );
	}
	foreach ( $body['fondos'] as $f ) {
		if ( empty( $f['isin'] ) ) {
			return new WP_Error( 'bad_payload', 'Algun fondo no tiene ISIN', array( 'status' => 400 ) );
		}
	}

	update_option( 'epk_liga_snapshot', $body, false );
	update_option( 'epk_liga_snapshot_updated_at', time(), false );

	return new WP_REST_Response( array(
		'ok'             => true,
		'totalFondos'    => count( $body['fondos'] ),
		'updatedAt'      => time(),
	), 200 );
}
