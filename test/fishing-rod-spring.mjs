// The rod's bend spring must stay bounded at the engine's largest step (0.1 s: a hitch, a shader compile, a covered
// window). Before wave 27A the symplectic Euler step at K = 250 diverged exactly at dt = 0.1: the bend reached 1e6, the
// tip 1e10 m, the line and float meshes filled the screen and the frame rate never came back (seen in the browser pane).
//   node test/fishing-rod-spring.mjs
import './headless.mjs';
import * as E from '../src/engine/index.js';
import { FishingRod } from '../src/game/FishingRod.js';

let fails = 0;
const ok = ( c, msg ) => { if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg ); };

const scene = new E.Scene();
const camera = new E.PerspectiveCamera( 60, 16 / 9, 0.1, 1000 );
camera.position.set( 55, 4, 30 );
camera.lookAt( 55, 0, 60 );
camera.updateMatrixWorld && camera.updateMatrixWorld( true );
const query = { allocate: () => 0, setPoint() {}, cpuValid: true, cpu: new Float32Array( [ 0, 0, 0, - 5, 0, 0, 0, 0 ] ) };
const rod = new FishingRod( { scene, camera, query, terrain: { heightAt: () => - 5 } } );
rod.equipped = true;
const anchor = new E.Matrix4().makeTranslation( 55, 3.2, 32 );
rod.anchor = anchor;

const run = ( state, dt, frames, fight = null ) => {

	rod.setState( state );
	rod.bend = 0; rod.bendVel = 0;
	rod.bobber.set( 55, 0, 55 );
	let peak = 0;
	for ( let i = 0; i < frames; i ++ ) {

		rod.update( dt, { visible: true, fight } );
		peak = Math.max( peak, Math.abs( rod.bend ) );

	}

	return peak;

};

for ( const dt of [ 1 / 144, 1 / 60, 1 / 30, 0.08, 0.1 ] ) {

	const peak = run( 'floating', dt, 400 );
	ok( Number.isFinite( peak ) && peak < 0.5, `floating at dt ${ dt.toFixed( 4 ) }: bend peak ${ peak.toFixed( 4 ) } stays bounded` );
	const d = rod.tip.distanceTo( new E.Vector3( 55, 3.2, 32 ) );
	ok( d < 5, `tip stays near the hand (${ d.toFixed( 2 ) } m)` );

}

// a fight at the clamp: the bend follows the tension instead of flying off
const fight = { tension: 0.8, surge: 0.5, distance: 20 };
const peakFight = run( 'fighting', 0.1, 400, fight );
ok( Number.isFinite( peakFight ) && peakFight < 0.6, `fighting at dt 0.1: bend peak ${ peakFight.toFixed( 3 ) } bounded` );
ok( Math.abs( rod.bend - ( 0.06 + 0.3 * 0.8 + 0.05 * 0.5 ) ) < 0.05, `fighting bend settles on the target (${ rod.bend.toFixed( 3 ) })` );

// the engine's 0.1 s clamp with a step the integrator could not take: a non-finite bend is reset, not propagated
rod.setState( 'floating' );
rod.bend = NaN; rod.bendVel = NaN;
rod.update( 1 / 60, { visible: true, fight: null } );
ok( Number.isFinite( rod.bend ) && Number.isFinite( rod.bendVel ), 'a non-finite bend resets' );

console.log( fails ? `${ fails } FAILED` : 'all ok' );
process.exit( fails ? 1 : 0 );
