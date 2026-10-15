// Wave 23A: writes the skyscrapers' game geometry (SkylineMesh through Facades.buildingInto: what the city draws) as JSON
// for the Blender check renders (towers.py): per tower its near mesh whole, with an upper section broken off, and fallen.
//   node tools/meridian/skyline-json.mjs <out.json> [--far]
import { writeFileSync } from 'node:fs';
import { cityPlan } from '../../src/world/islands/meridian/CityPlan.js';
import { Acc, buildingInto } from '../../src/world/islands/meridian/Facades.js';
import { cutRange } from '../../src/world/islands/meridian/Skyline.js';

const far = process.argv.includes( '--far' );
const plan = cityPlan();
const out = { center: plan.center, towers: [] };
const r = ( v ) => Math.round( v * 100 ) / 100;
const dump = ( b, opts ) => {

	const acc = new Acc();
	buildingInto( acc, b, { detail: ! far, ...opts } );
	const pos = [];
	for ( let i = 0; i < acc.pos.length; i += 3 ) pos.push( r( acc.pos[ i ] - b.x ), r( acc.pos[ i + 1 ] - b.y ), r( acc.pos[ i + 2 ] - b.z ) );
	return { pos, idx: acc.idx, col: acc.col.map( ( c ) => Math.round( c * 1000 ) / 1000 ), code: acc.aux.filter( ( _, i ) => i % 4 === 0 ), tris: acc.idx.length / 3 };

};
for ( const b of plan.buildings.filter( ( q ) => q.kind === 'tower' ) ) {

	const [ lo, hi ] = cutRange( b );
	out.towers.push( { id: b.id, name: b.name, w: b.w, d: b.d, h: b.h, top: b.top - b.y, whole: dump( b, {} ), cut: dump( b, { cut: ( lo + hi ) / 2, stage: 2 } ), fallen: dump( b, { stage: 3 } ) } );

}

writeFileSync( process.argv[ 2 ] || 'skyline.json', JSON.stringify( out ) );
console.log( out.towers.map( ( t ) => `${ t.id } ${ t.whole.tris } tris (cut ${ t.cut.tris }, fallen ${ t.fallen.tris })` ).join( '\n' ) );
