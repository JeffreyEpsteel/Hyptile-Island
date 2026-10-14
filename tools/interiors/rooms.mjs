// Wave 19E: the rooms as JSON for the Blender renders (tools/interiors/kit.py renders each room from this).
//   node tools/interiors/rooms.mjs <out.json>
import { writeFileSync } from 'node:fs';
import { INTERIORS, layoutRoom, SHELL_HINTS } from '../../src/world/interiors/Rooms.js';

const out = [];
for ( const def of INTERIORS ) {

	const R = layoutRoom( def, SHELL_HINTS[ def.id ] );
	const lin = R.lining;
	out.push( { id: def.id, X: R.X, Z: R.Z, h: R.h, doorX: R.doorX, doorW: R.doorW, doorH: R.doorH, pieces: R.pieces, lights: R.lights, views: R.views,
		lining: { floor: lin.floor, wall: lin.wall, wainscot: lin.wainscot || lin.wall, ceiling: lin.ceiling } } );

}

writeFileSync( process.argv[ 2 ] || 'rooms.json', JSON.stringify( out, null, 1 ) );
console.log( 'rooms', out.map( ( r ) => r.id + ':' + r.pieces.length ).join( ' ' ) );
