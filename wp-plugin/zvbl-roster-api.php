<?php
/**
 * Plugin Name: ZVBL Roster API
 * Description: Exposes SportsPress player meta fields to the REST API and enables CORS for the roster manager app.
 * Version: 1.0.0
 * Author: ZVBL
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Register custom meta fields for sp_player so they appear in REST API responses.
 */
add_action( 'init', function () {
    $meta_fields = [
        'sp_number' => [
            'type'        => 'string',
            'description' => 'Jersey number',
        ],
        'zvbl_date_of_birth' => [
            'type'        => 'string',
            'description' => 'Date of birth (YYYY-MM-DD)',
        ],
        'zvbl_batting_hand' => [
            'type'        => 'string',
            'description' => 'Batting hand (R, L, or S)',
        ],
        'zvbl_throwing_hand' => [
            'type'        => 'string',
            'description' => 'Throwing hand (R or L)',
        ],
        'zvbl_parent_email' => [
            'type'        => 'string',
            'description' => 'Parent/guardian email',
            'sanitize_callback' => 'sanitize_email',
        ],
        'zvbl_parent_phone' => [
            'type'        => 'string',
            'description' => 'Parent/guardian phone number',
            'sanitize_callback' => 'sanitize_text_field',
        ],
    ];

    foreach ( $meta_fields as $key => $args ) {
        register_post_meta( 'sp_player', $key, [
            'type'              => $args['type'],
            'description'       => $args['description'],
            'single'            => true,
            'show_in_rest'      => true,
            'sanitize_callback' => $args['sanitize_callback'] ?? 'sanitize_text_field',
            'auth_callback'     => function () {
                return current_user_can( 'edit_posts' );
            },
        ] );
    }
} );

/**
 * Add position term names to player REST responses for easy display.
 */
add_action( 'rest_api_init', function () {
    register_rest_field( 'sp_player', 'sp_position_names', [
        'get_callback' => function ( $object ) {
            $terms = get_the_terms( $object['id'], 'sp_position' );
            if ( is_wp_error( $terms ) || empty( $terms ) ) {
                return [];
            }
            return wp_list_pluck( $terms, 'name' );
        },
        'schema' => [
            'type'        => 'array',
            'description' => 'Position names',
            'items'       => [ 'type' => 'string' ],
        ],
    ] );
} );

/**
 * Ensure the sp_position taxonomy is available in REST for filtering.
 */
add_action( 'init', function () {
    // Only modify if SportsPress has registered it
    if ( taxonomy_exists( 'sp_position' ) ) {
        $taxonomy = get_taxonomy( 'sp_position' );
        if ( ! $taxonomy->show_in_rest ) {
            $taxonomy->show_in_rest = true;
            $taxonomy->rest_base    = 'sp_position';
        }
    }
}, 20 ); // Run after SportsPress init

/**
 * Handle CORS for the roster manager app.
 * Allows requests from localhost (development) and your production domain.
 */
add_action( 'rest_api_init', function () {
    // Remove default CORS handling so we can customize it
    remove_filter( 'rest_pre_serve_request', 'rest_send_cors_headers' );

    add_filter( 'rest_pre_serve_request', function ( $value ) {
        $origin = get_http_origin();

        // Allow localhost for development and your production domain
        $allowed_origins = [
            'http://localhost:3000',
            'http://localhost:5173',
            'https://roster.zvbl.org',
        ];

        /**
         * Filter the allowed CORS origins for the roster API.
         *
         * @param array $allowed_origins List of allowed origin URLs.
         */
        $allowed_origins = apply_filters( 'zvbl_roster_cors_origins', $allowed_origins );

        if ( in_array( $origin, $allowed_origins, true ) ) {
            header( 'Access-Control-Allow-Origin: ' . $origin );
            header( 'Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS' );
            header( 'Access-Control-Allow-Headers: Authorization, Content-Type' );
            header( 'Access-Control-Allow-Credentials: true' );
        }

        return $value;
    } );
}, 15 );

/**
 * Handle preflight OPTIONS requests.
 */
add_action( 'init', function () {
    if ( isset( $_SERVER['REQUEST_METHOD'] ) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS' ) {
        $origin = isset( $_SERVER['HTTP_ORIGIN'] ) ? $_SERVER['HTTP_ORIGIN'] : '';

        $allowed_origins = apply_filters( 'zvbl_roster_cors_origins', [
            'http://localhost:3000',
            'http://localhost:5173',
            'https://roster.zvbl.org',
        ] );

        if ( in_array( $origin, $allowed_origins, true ) ) {
            header( 'Access-Control-Allow-Origin: ' . $origin );
            header( 'Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS' );
            header( 'Access-Control-Allow-Headers: Authorization, Content-Type' );
            header( 'Access-Control-Allow-Credentials: true' );
            header( 'Access-Control-Max-Age: 86400' );
            status_header( 204 );
            exit;
        }
    }
} );

/**
 * Custom REST endpoint for reading/writing ZVBL player meta fields.
 * The SportsPress v2 controller does not pass through meta writes,
 * so we handle them via our own route: /zvbl/v1/player-meta/<id>
 */
add_action( 'rest_api_init', function () {
    $zvbl_meta_keys = [
        'zvbl_date_of_birth',
        'zvbl_batting_hand',
        'zvbl_throwing_hand',
        'zvbl_parent_email',
        'zvbl_parent_phone',
    ];

    register_rest_route( 'zvbl/v1', '/player-meta/(?P<id>\d+)', [
        [
            'methods'             => 'GET',
            'callback'            => function ( WP_REST_Request $request ) use ( $zvbl_meta_keys ) {
                $player_id = (int) $request['id'];
                if ( get_post_type( $player_id ) !== 'sp_player' ) {
                    return new WP_Error( 'invalid_player', 'Not a valid player.', [ 'status' => 404 ] );
                }
                $meta = [];
                foreach ( $zvbl_meta_keys as $key ) {
                    $meta[ $key ] = get_post_meta( $player_id, $key, true );
                }
                return rest_ensure_response( $meta );
            },
            'permission_callback' => function () {
                return current_user_can( 'edit_posts' );
            },
        ],
        [
            'methods'             => 'POST',
            'callback'            => function ( WP_REST_Request $request ) use ( $zvbl_meta_keys ) {
                $player_id = (int) $request['id'];
                if ( get_post_type( $player_id ) !== 'sp_player' ) {
                    return new WP_Error( 'invalid_player', 'Not a valid player.', [ 'status' => 404 ] );
                }
                $body = $request->get_json_params();
                $updated = [];
                foreach ( $zvbl_meta_keys as $key ) {
                    if ( isset( $body[ $key ] ) ) {
                        update_post_meta( $player_id, $key, sanitize_text_field( $body[ $key ] ) );
                        $updated[ $key ] = $body[ $key ];
                    }
                }
                return rest_ensure_response( $updated );
            },
            'permission_callback' => function () {
                return current_user_can( 'edit_posts' );
            },
        ],
    ] );
} );
