// Wave 24D: rain wetness (src/materials/Wetness.js -> frame.wetness -> every scene material), plain node.
//   node test/visuals-wet.mjs
import { stepWetness, updateWetness, WETNESS } from '../src/materials/Wetness.js';
import { G, FrameUniforms } from '../src/engine/render/Frame.js';
import { readFileSync } from 'node:fs';

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg );

};
const run = ( w, rain, s, sun = 0.5, wind = 5 ) => { for ( let t = 0; t < s; t += 1 / 30 ) w = stepWetness( w, rain, 1 / 30, sun, wind ); return w; };

ok( G.wetness && FrameUniforms.fields.wetness === G.wetness && G.wetness.value === 0, 'G.wetness is the frame block\'s field, dry at start' );
ok( run( 0, 1, 30 ) > 0.95, `a downpour soaks the world in ~30 s (${ run( 0, 1, 30 ).toFixed( 2 ) })` );
const drizzle = run( 0, 0.2, 300 );
ok( drizzle > 0.2 && drizzle < 0.4, `a drizzle leaves things damp (${ drizzle.toFixed( 2 ) })` );
ok( run( 1, 0, 60, 0, 2 ) > 0.6, `still overcast air: still wet a minute later (${ run( 1, 0, 60, 0, 2 ).toFixed( 2 ) })` );
ok( run( 1, 0, 600, 1, 5 ) === 0, 'sun and wind dry it within ten minutes' );
ok( run( 1, 0, 60, 1, 8 ) < run( 1, 0, 60, 0, 0 ), 'sun and wind dry faster' );
let finite = true, mono = true, w = 0, last = 0;
for ( let i = 0; i < 2000; i ++ ) {

	w = stepWetness( w, i < 1000 ? 0.8 : 0, 1 / 60 );
	if ( ! Number.isFinite( w ) || w < 0 || w > 1 ) finite = false;
	if ( i < 1000 && w < last - 1e-12 ) mono = false;
	if ( i >= 1000 && w > last + 1e-12 ) mono = false;
	last = w;

}

ok( finite && mono, 'in 0..1, rising in rain, falling after it' );
ok( stepWetness( NaN, NaN, NaN ) === 0 && stepWetness( 0.5, 1, - 5 ) === 0.5, 'bad inputs: no change / dry' );
ok( updateWetness( 1, 1 ) > 0 && G.wetness.value > 0, 'updateWetness writes G.wetness' );
G.wetness.value = 0;
ok( WETNESS.soak > WETNESS.dry, 'soaks faster than it dries' );
const src = readFileSync( new URL( '../src/materials/Materials.js', import.meta.url ), 'utf8' );
const sd = src.slice( src.indexOf( 'const SURFACE_DETAIL' ), src.indexOf( 'function engineParams' ) );
ok( /if \( frame\.wetness > 0\.001 \)/.test( sd ) && sd.indexOf( 'frame.wetness' ) < sd.indexOf( '#if MATERIAL_DETAIL' ), 'every scene material reads frame.wetness (outside the phone-off detail block)' );
const pt = readFileSync( new URL( '../tools/visuals/patches.mjs', import.meta.url ), 'utf8' );
ok( /updateWetness\( dt, p\.rain/.test( pt ), 'the weather patch drives it from the rain' );

console.log( fails ? `\n${ fails } failed` : '\nall wetness checks passed' );
process.exit( fails ? 1 : 0 );
