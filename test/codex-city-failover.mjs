// Production CityWreck authority transition, real Meridian roof/collider handles; no GPU or socket.
import assert from 'node:assert/strict';
import { Features } from '../src/features/Features.js';
import * as citywreck from '../src/features/citywreck/index.js';
import { CityModel } from '../src/features/citywreck/Model.js';
import { REPAIR } from '../src/features/citywreck/CityWreckData.js';
import { stubPlan } from '../src/features/citywreck/StubCity.js';
import { Meridian } from '../src/world/islands/meridian/Meridian.js';
import { Colliders } from '../src/world/Colliders.js';
import { sanitizeEvent } from '../src/net/Protocol.js';

let checks = 0;
const check = ( value, label ) => { assert.ok( value, label ); checks ++; console.log( 'ok', label ); };
function rig( host ) {

	const colliders = new Colliders(), city = new Meridian( { scene: null, colliders, kit: false } );
	const net = { online: true, isHost: host, sendWorldEvent: () => true, askHost: () => true };
	const app = { settings: { timeOfDay: 9 }, meridian: city, netsync: net }, features = new Features( app );
	const wreck = features.add( 'citywreck', { install: ( a, f ) => citywreck.install( a, f, { city, render: false } ) } );
	const stepHours = hours => { for ( let i = 0; i < hours * 10; i ++ ) { app.settings.timeOfDay = ( app.settings.timeOfDay + 0.1 ) % 24; wreck.update( 0.1 ); } };
	return { colliders, city, net, app, features, wreck, stepHours, dispose() { wreck.dispose(); city.dispose(); } };

}
const host = rig( true ), guest = rig( false );
try {

	const H = host.wreck.model, G = guest.wreck.model;
	const collapse = id => { const b = H.byId.get( id ); H.hit( b, b.hp * 2, { cause: 'blast', by: 'player' } ); };
	collapse( 'twin-south' ); H.update( 0.1, { hours: REPAIR.quiet + 0.1 } ); H.update( 0.1, { hours: REPAIR.clearRubble + 0.1 } );
	collapse( 'twin-north' ); H.update( 0.1, { hours: REPAIR.quiet + 0.1 } );
	check( H.byId.get( 'twin-north' ).repair.phase === 'clear' && H.byId.get( 'twin-south' ).repair.phase === 'build', 'old host has towers in both clearance and building phases' );
	// Pass through the real sender, protocol event sanitizer and feature receiver.
	host.net.sendWorldEvent = ( kind, data ) => { guest.features.emit( 'remoteWorldEvent', { ...sanitizeEvent( { kind, data } ), from: 'old-host' } ); return true; };
	host.wreck._sendStages( H.snapshot( false ), true ); guest.wreck.update( 0.1 );
	for ( const id of [ 'twin-north', 'twin-south' ] ) {

		const b = G.byId.get( id ), p = guest.city.building( id ).plan, x = p.x + 18, z = p.z, top = p.y + p.h;
		check( b.stage === 3 && b.repair.due === Infinity, id + ': guest inherits paused repair phase from real stage stream' );
		check( ! guest.city.landingSurfaceAt( x, z, top + 1 ) && guest.colliders.groundHeightAt( x, z, top + 1 ) < top, id + ': collapsed remote tower has no roof support' );

	}
	host.net.isHost = false; host.wreck.update( 0.1 ); guest.net.isHost = true;
	guest.net.sendWorldEvent = ( kind, data ) => { host.features.emit( 'remoteWorldEvent', { ...sanitizeEvent( { kind, data } ), from: 'new-host' } ); return true; };
	guest.wreck.update( 0.1 );
	for ( const id of [ 'twin-north', 'twin-south' ] ) {

		const b = G.byId.get( id ), duration = b.repair.phase === 'clear' ? REPAIR.clearRubble : REPAIR.hours[ 3 ];
		check( ! G.puppet && Number.isFinite( b.repair.due ) && Math.abs( b.repair.due - b.repair.start - duration ) < 1e-9, id + ': actual host transition starts finite phase with normal duration' );
		check( b.stage === 3, id + ': taking authority does not instantly repair collapsed geometry' );

	}
	const deadline = G.byId.get( 'twin-north' ).repair.due; guest.wreck.update( 0.1 );
	check( G.byId.get( 'twin-north' ).repair.due === deadline, 'ordinary host frames do not restart repair scheduling' );
	guest.stepHours( REPAIR.clearRubble + 0.2 );
	check( G.byId.get( 'twin-north' ).repair.phase === 'build' && G.byId.get( 'twin-north' ).cleared, 'new host finishes clearance and begins rebuilding' );
	guest.stepHours( REPAIR.hours[ 3 ] + 0.2 );
	for ( const id of [ 'twin-north', 'twin-south' ] ) {

		const b = G.byId.get( id ), p = guest.city.building( id ).plan, x = p.x + 18, z = p.z, top = p.y + p.h;
		check( b.stage === 0 && b.repair === null && b.dmg === 0, id + ': promoted guest completes inherited repair' );
		check( guest.city.landingSurfaceAt( x, z, top + 1 )?.y === top && guest.colliders.groundHeightAt( x, z, top + 1 ) === top, id + ': repair restores real aircraft and walking roof support' );
		check( H.byId.get( id ).stage === 0 && host.city.landingSurfaceAt( x, z, top + 1 )?.y === top && host.colliders.groundHeightAt( x, z, top + 1 ) === top, id + ': new host repair stream also restores former host roof support' );

	}
	const m = new CityModel( stubPlan(), { puppet: true } ), b = m.byId.get( 'stub.low.0' );
	m.apply( [ [ b.id, 1, 0, 2 ] ], { remote: true } ); b.repair = { phase: 'build', start: 2, due: 9 }; m.hours = 3;
	check( m.setPuppet( false ) === 0 && b.repair.due === 9 && b.repair.start === 2, 'finite saved/local repair deadlines are preserved at promotion' );
	check( m.setPuppet( true ) === 0 && m.puppet && b.stage === 1, 'demotion preserves damage and scheduling while disabling simulation' );
	m.update( 0.1, { hours: 20 } ); check( b.stage === 1, 'guest role cannot complete a host repair itself' );

} finally { host.dispose(); guest.dispose(); }
console.log( `${ checks } city failover checks passed` );
