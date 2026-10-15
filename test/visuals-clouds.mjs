// Wave 24D: the sky's weather response, plain node.
//   node test/visuals-clouds.mjs
// - skyCoverage (SkyProClouds.js): the weather's coverage -> the cumulus model's (clear days get fair-weather cumulus,
//   0 stays cloudless, monotonic, a storm is a closed deck)
// - the coverage easing no longer resets the cloud history every frame (only a jump does)
// - overcastJS (Atmosphere.js): the deck's grey sky light is dimmer, less saturated, and the WGSL mirrors it
import { skyCoverage } from '../src/sky/SkyProClouds.js';
import { OVERCAST, overcastJS } from '../src/sky/Atmosphere.js';
import { climate } from '../src/features/weather/Climate.js';
import { readFileSync } from 'node:fs';

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg );

};
const lum = ( c ) => c[ 0 ] * 0.2126 + c[ 1 ] * 0.7152 + c[ 2 ] * 0.0722;

// ---- the coverage map
{

	let mono = true, prev = - 1, finite = true;
	for ( let c = 0; c <= 1.0001; c += 0.005 ) {

		const v = skyCoverage( c );
		if ( ! Number.isFinite( v ) || v < 0 || v > 1 ) finite = false;
		if ( v < prev - 1e-9 ) mono = false;
		prev = v;

	}

	ok( finite && mono, 'skyCoverage is finite, in 0..1 and monotonic' );
	ok( skyCoverage( 0 ) === 0 && skyCoverage( NaN ) === 0, 'no weather coverage: a cloudless sky' );
	ok( skyCoverage( 1 ) === 1 && skyCoverage( 2 ) === 1, 'a storm: the closed deck' );
	const clear = [ climate( 'clear', 0 ).clouds, climate( 'clear', 1 ).clouds ].map( skyCoverage );
	ok( clear.every( ( v ) => v >= 0.35 && v <= 0.5 ), `clear days draw fair-weather cumulus (${ clear.map( ( v ) => v.toFixed( 2 ) ) }; the model's "Partly cloudy" is 0.49)` );
	const storm = skyCoverage( climate( 'storm', 1 ).clouds ), over = skyCoverage( climate( 'overcast', 1 ).clouds );
	ok( storm >= 0.98 && over >= 0.9, `overcast / storm close the deck (${ over.toFixed( 2 ) } / ${ storm.toFixed( 2 ) })` );

}

// ---- the history reset: only on a jump (source check: the update path)
{

	const src = readFileSync( new URL( '../src/sky/SkyProClouds.js', import.meta.url ), 'utf8' );
	const block = src.slice( src.indexOf( 'const cov = skyCoverage(' ), src.indexOf( 'const wd = G.windDir.value' ) );
	ok( /Math\.abs\( cov - this\._lastCoverage \) > COVERAGE_JUMP/.test( block ) && ( block.match( /historyValid = false/g ) || [] ).length === 1, 'a coverage drift keeps the cloud history (a jump resets it)' );

}

// ---- the overcast sky light
{

	const sky = [ 0.12, 0.25, 0.6 ];
	const same = overcastJS( sky, 0 );
	ok( same.every( ( x, i ) => x === sky[ i ] ), 'overcast 0: the clear sky unchanged' );
	const o = overcastJS( sky, 1 );
	const sat = ( c ) => ( Math.max( ...c ) - Math.min( ...c ) ) / Math.max( ...c );
	ok( lum( o ) < lum( sky ) * 0.7 && lum( o ) > lum( sky ) * 0.3, `overcast 1: dimmer (${ ( lum( o ) / lum( sky ) ).toFixed( 2 ) } of the clear luminance)` );
	ok( sat( o ) < sat( sky ) * 0.6, `overcast 1: grey (saturation ${ sat( sky ).toFixed( 2 ) } -> ${ sat( o ).toFixed( 2 ) })` );
	ok( Math.abs( lum( OVERCAST.tint ) - 1 ) < 0.01, 'the overcast tint has unit luminance' );
	let mono = true, last = Infinity;
	for ( let k = 0; k <= 1; k += 0.05 ) { const l = lum( overcastJS( sky, k ) ); if ( l > last + 1e-9 ) mono = false; last = l; }
	ok( mono, 'the sky light dims monotonically with the deck' );
	const src = readFileSync( new URL( '../src/sky/Atmosphere.js', import.meta.url ), 'utf8' );
	ok( /fn atmosphereOvercast/.test( src ) && /return atmosphereOvercast\( L \)/.test( src ) && /overcast: \[ 'f32', 0 \]/.test( src ), 'the WGSL sky luminance goes through the overcast (uniform in the atmosphere block)' );

}

console.log( fails ? `\n${ fails } failed` : '\nall cloud checks passed' );
process.exit( fails ? 1 : 0 );
