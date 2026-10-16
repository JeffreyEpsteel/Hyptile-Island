import { readFileSync } from 'node:fs';
const b = readFileSync( process.argv[2] );
const jl = b.readUInt32LE( 12 );
const j = JSON.parse( b.slice( 20, 20 + jl ).toString() );
const out = j.animations.map( ( a ) => { let d = 0; for ( const s of a.samplers ) d = Math.max( d, j.accessors[ s.input ].max[ 0 ] ); return a.name + ':' + d.toFixed( 1 ); } );
console.log( out.join( '  ' ) );
