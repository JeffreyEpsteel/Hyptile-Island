// Headless preview of the destructible props (test/life-harness.mjs, Dawn WebGPU): the raider camp whole, then broken by a
// blast and settled. Writes PNGs to the folder given as the first argument (default test/out).
//   node tools/destruction/preview.mjs <outDir>
import '../../test/headless.mjs';
import { mkdirSync } from 'node:fs';
import { setupLife } from '../../test/life-harness.mjs';
import { Colliders } from '../../src/world/Colliders.js';
import { Vector3 } from '../../src/engine/index.js';
import { Features } from '../../src/features/Features.js';
import { initPhysics } from '../../src/physics/World.js';
import * as destruction from '../../src/features/destruction/index.js';

const out = process.argv[ 2 ] || new URL( '../../test/out/', import.meta.url ).pathname.replace( /^\/([A-Z]:)/, '$1' );
mkdirSync( out, { recursive: true } );
const CX = 127, CZ = - 71;
const L = await setupLife( { W: 1280, H: 720, ground: { center: [ CX, CZ ], size: 90, res: 0.5 }, water: true, shadowSplits: [ 10, 40, 200 ] } );
const T = L.terrain;
const app = { scene: L.scene, terrainData: T, colliders: new Colliders(), settings: { timeOfDay: 12 }, player: { position: new Vector3( 0, 0, - 400 ), yaw: 0, mode: 'walk' } };
const features = new Features( app );
const d = features.add( 'destruction', destruction );
await initPhysics();
await new Promise( ( r ) => setTimeout( r, 50 ) );
d.build();
await new Promise( ( r ) => setTimeout( r, 50 ) ); // Render.js loads
for ( let i = 0; i < 3; i ++ ) features.update( 1 / 60 );
const camp = d.props.filter( ( p ) => p.site === 'camp' );
console.log( 'camp props', camp.map( ( p ) => `${ p.kind } (${ p.x.toFixed( 1 ) }, ${ p.z.toFixed( 1 ) })` ).join( ', ' ) );
const view = ( pos, target ) => { L.camera.position.set( ...pos ); L.camera.lookAt( ...target ); L.camera.updateMatrixWorld(); };
const gy = T.heightAt( CX, CZ );
const pos = [ CX - 14, gy + 7, CZ + 16 ], tgt = [ CX, gy + 0.5, CZ ];
await L.run( 4, () => { features.update( 1 / 60 ); view( pos, tgt ); } );
await L.save( out + '/destruction-camp-whole.png' );
// break the hut and its neighbours with a blast, then let it settle
const hut = camp.find( ( p ) => p.kind === 'leanTo' ) || camp[ 0 ];
for ( const p of camp ) if ( p !== hut ) d.breakProp( p.id, { energy: p.K.toughness * 1.3 } );
d.blast( hut.center.x + 1.2, hut.center.y, hut.center.z, 3, 2200 );
await L.run( 20, () => { features.update( 1 / 60 ); view( pos, tgt ); } );
await L.save( out + '/destruction-camp-breaking.png' );
for ( let i = 0; i < 240; i ++ ) features.update( 1 / 60 );
await L.run( 4, () => { features.update( 1 / 60 ); view( pos, tgt ); } );
await L.save( out + '/destruction-camp-settled.png' );
console.log( JSON.stringify( d.info() ) );
await L.exit();
