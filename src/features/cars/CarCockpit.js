// The car you sit in (wave 24A): its modelled interior (CarInterior.js, one GLB per kind, loaded only for the car you drive
// or stand next to; the city's other cabins stay the cheap instanced ones of CarRender), working: the wheel turns with the
// rack and the driver's arms follow it, the pedals press, the selector moves, the stalks flick, the wipers sweep in the
// rain, the cluster / stack / auxiliary displays read the simulation (CarInstruments.js), the dome lamp lights the cabin.
// Look at a switch on the centre stack and click it (first person); 3 opens the accessible tray of the same switches.
//
//   cockpit.setRecord( rec | null )   update( dt )   act( id ) -> { ok, reason? }   open() / close() / isOpen
//   cockpit.interior (the built interior or null)   cockpit.ready (a promise: the current kind's GLB)   cockpit.lights
//   opts: { canvas, visual, loader: kind -> Promise<gltf> } (tests read the GLBs from disk)
import { Group, Vector3, Quaternion, Color, Matrix4 } from '../../engine/index.js';
import { Texture } from '../../engine/gpu/Texture.js';
import { GPU } from '../../engine/gpu/GPU.js';
import { carPanelSnapshot, carControl, systemsOf, wiperAngle, drivetrain, WIPE } from './CarSystems.js';
import { LAYERS } from '../../core/SceneRenderer.js';
import { ATLAS, buildInterior, loadInteriorGLB, rainSetup, rayScreens, LimbSet, turnNode, cabinMaterial } from './CarInterior.js';
import { CONTROLS, controlsFor, hitControl, drawInstruments, controlOn, controlState } from './CarInstruments.js';

export { CONTROLS, hitControl, controlsFor };
export const PANEL = ATLAS;
export const CABIN_STYLES = {
	sedan: { id: 'cloth-saloon', label: 'Cloth seats, walnut, soft dash, twin analogue dials' },
	taxi: { id: 'taxi-duty', label: 'Wipe-clean vinyl, partition, fare meter' },
	police: { id: 'police-interceptor', label: 'Radio, laptop mount, light bar panel, rear cage' },
	pickup: { id: 'utility-bench', label: 'Bench seat, rubber floor, column shifter, square gauges' },
	van: { id: 'cab-forward', label: 'Utility cab, bulkhead, cargo bay with shelving' },
	sports: { id: 'carbon-bucket', label: 'Bucket seats, carbon trim, flat-bottom wheel with paddles' },
	bus: { id: 'transit-cab', label: 'Driver cab, ticket machine, passenger rows' },
};
// steering ratio of the rim to the road wheels; the selector's angle per gear
const WHEEL_RATIO = { sedan: 2.6, taxi: 2.6, police: 2.5, pickup: 3, van: 3.2, sports: 2.1, bus: 5.5 };
const GEAR_ANGLE = { P: 0.32, R: 0.16, N: 0.0, D: - 0.18 };
const PEEK = 6.5; // m: standing this near a car loads its interior (you can look in through the glass)
const clamp = ( n, a, b ) => Math.max( a, Math.min( b, n ) );

const CSS = `
.car-driver-tip{position:absolute;left:50%;bottom:calc(38 * var(--tw-u));transform:translateX(-50%);padding:8px 14px;border-radius:8px;background:#101e29e8;color:#cce9df;font:600 13px system-ui;pointer-events:none;z-index:5}
.car-driver-panel{position:absolute;left:50%;bottom:var(--tw-edge);transform:translateX(-50%);width:min(560px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow-y:auto;box-sizing:border-box;padding:18px;border-radius:16px;background:#122431f5;color:#deede8;box-shadow:0 12px 50px #0009;font:14px system-ui;z-index:7;pointer-events:auto}
.car-driver-panel[hidden],.car-driver-tip[hidden]{display:none}
.car-driver-panel h2{margin:0 0 10px;font-size:18px}.car-driver-output{font:600 16px monospace;color:#89e5cb;margin:10px 0}.car-driver-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.car-driver-panel button{padding:12px;color:#e0efe9;background:#294350;border:1px solid #789d99;border-radius:8px;cursor:pointer;font:600 14px system-ui;min-height:44px}.car-driver-panel button:focus-visible{outline:3px solid #91f5da;outline-offset:2px}.car-driver-panel button[aria-pressed=true]{background:#326756}.car-driver-panel p{color:#c1d3ce;line-height:1.5}.car-driver-close{width:100%;margin-top:10px}.car-driver-message{min-height:20px;color:#ffc677}
.car-cockpit .tw-plane,.car-cockpit .sp-strip{display:none!important}.tw-root.is-photo .car-driver-panel,.tw-root.is-photo .car-driver-tip{display:none}
.tw-root.is-touch .car-driver-tip{bottom:auto;top:calc(var(--tw-edge) + 80px);max-width:calc(100vw - 32px);text-align:center}
`;

function defaultBase() {

	try { return ( import.meta.env && import.meta.env.BASE_URL ) || '/'; } catch ( e ) { return '/'; }

}

const _q = new Quaternion(), _v = new Vector3(), _w = new Vector3(), _h = new Vector3(), _m = new Matrix4();

export class CarCockpit {

	constructor( cars, { canvas = null, visual = cars.opts.render !== false, loader = null } = {} ) {

		this.cars = cars; this.app = cars.app; this.visual = visual; this.canvas = canvas; this.ctx = null;
		const base = defaultBase();
		this.loader = loader || cars.opts.interiorLoader || ( ( kind ) => loadInteriorGLB( ( base.endsWith( '/' ) ? base : base + '/' ) + 'models/cars/interior-' + kind + '.glb' ) );
		this.cache = new Map(); // kind -> Promise<gltf | null>
		this.gltfs = new Map(); // kind -> gltf (loaded)
		this.group = null; this.record = null; this.interior = null; this.interiorKind = null; this.peek = null; this.limbs = [];
		this.tex = null; this.hover = null; this.isOpen = false; this.el = null; this.tip = null; this._acc = 1; this.redraws = 0;
		this.rain = 0; this.rainOverride = null; this.ready = Promise.resolve( null );
		// the cabin's own lamp (a LocalLights point source near the roof): the dome light, a faint dash glow at night
		this.lights = [ { id: 'car-cabin', kind: 'car', position: new Vector3(), color: new Color( 1, 0.86, 0.66 ), intensity: 0, range: 3.4, enabled: false, indoor: 0, update() {} } ];
		this._onMove = e => { this.mouse = { x: e.clientX, y: e.clientY }; };
		this._onKey = e => {

			if ( ! this.isOpen ) return;
			if ( this.blocked() ) { this.close(); if ( [ 'Space', 'Enter', 'NumpadEnter' ].includes( e.code ) ) e.preventDefault(); return; }
			if ( e.code === 'Escape' || e.code === 'Digit3' ) { this.close(); e.preventDefault(); e.stopPropagation(); }
			// Input normally prevents Tab / Space; let the browser focus and activate these actual buttons.
			else if ( [ 'Tab', 'Space', 'Enter', 'NumpadEnter' ].includes( e.code ) ) e.stopPropagation();

		};
		this._onButton = e => {

			const b = e.target?.closest?.( '[data-car-control]' );
			if ( ! b ) return;
			if ( b.dataset.carControl === 'close' ) return this.close();
			const r = this.act( b.dataset.carControl ); if ( this.message ) this.message.textContent = r.ok ? '' : r.reason;

		};
		globalThis.window?.addEventListener?.( 'mousemove', this._onMove, { passive: true } );

	}

	get firstPerson() { return !! ( this.cars.drive && this.app.player?.vehicle === this.cars.vehicle && this.app.player.view === 'first' && ! this.app.freeCam ); }
	blocked() {

		const ui = this.app.ui?.ui, hud = this.app.game?.hud;
		if ( this.app.paused || this.app.menuOpen || this.app.input?.enabled === false || this.app.game?.guide?.open || ui?.helpOpen || ui?.panelOpen || ui?.photoMode || ui?._start || hud?.invOpen || hud?.standOpen || hud?.rosterOpen || hud?.catchOpen || this.cars.panel?.isOpen ) return true;
		// A second feature can open after our tray focused a native button (for example M -> map).
		for ( const { instance } of this.cars.features?.list?.values?.() || [] ) {

			if ( ! instance || instance === this.cars ) continue;
			if ( typeof instance.isOpen === 'function' ? instance.isOpen() : instance.isOpen ) return true;

		}
		return false;

	}
	act( id ) {

		if ( this.blocked() ) return { ok: false, reason: 'blocked' };
		const result = carControl( this.cars, id );
		if ( result.ok ) this.cars.audio?.click?.( id );
		if ( ! result.ok && result.reason?.startsWith( 'Stop before' ) ) this.cars._toast( result.reason, 1800 );
		this._acc = 1;
		return result;

	}

	// Accessible equivalent of the stack's switches. Opening it releases mouse capture; Escape returns to driving.
	open() {

		if ( ! this.cars.drive || this.blocked() || this.cars.features?.panelOpen?.() && ! this.isOpen ) return false;
		this.isOpen = true; this._dom();
		try { if ( globalThis.document?.pointerLockElement ) document.exitPointerLock?.(); } catch { /* no lock */ }
		globalThis.document?.addEventListener?.( 'keydown', this._onKey, true );
		this.el?.querySelector?.( 'button' )?.focus?.(); return true;

	}
	close() { this.isOpen = false; if ( this.el ) this.el.hidden = true; globalThis.document?.removeEventListener?.( 'keydown', this._onKey, true ); }

	// the GLB of a kind, once (a failed load is remembered as null: the instanced cabin stays)
	_load( kind ) {

		if ( ! this.cache.has( kind ) ) {

			const p = Promise.resolve().then( () => this.loader( kind ) ).then( ( g ) => { if ( g ) this.gltfs.set( kind, g ); return g || null; } ).catch( ( e ) => { console.warn( 'cars: no interior for ' + kind, e?.message || e ); return null; } );
			this.cache.set( kind, p );

		}
		return this.cache.get( kind );

	}

	setRecord( record, { driven = true } = {} ) {

		if ( record === this.record && driven === this._driven ) return;
		if ( record !== this.record ) {

			if ( this.record ) this.record.cockpitDetailed = false;
			this.close(); this._releaseVisual(); this.record = record; this.hover = null; this._lmb = false;
			if ( ! record ) { this.app.ui?.ui?.root?.classList?.remove( 'car-cockpit' ); if ( this.tip ) this.tip.hidden = true; }

		}
		this._driven = driven;
		if ( record && this.visual && this.app.scene ) {

			this.ready = this._load( record.kind );
			if ( this.gltfs.has( record.kind ) ) this._build();

		}

	}

	_texture() {

		if ( this.tex ) return this.tex;
		if ( ! this.canvas ) this.canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas( ATLAS.w, ATLAS.h ) : globalThis.document?.createElement?.( 'canvas' );
		if ( this.canvas ) { this.canvas.width = ATLAS.w; this.canvas.height = ATLAS.h; this.ctx = this.canvas.getContext( '2d' ); }
		const pixels = new Uint8Array( ATLAS.w * ATLAS.h * 4 ); for ( let i = 3; i < pixels.length; i += 4 ) pixels[ i ] = 255;
		this.tex = new Texture( { label: 'car.instruments', width: ATLAS.w, height: ATLAS.h, format: 'rgba8unorm-srgb', mips: false, usage: [ 'sample', 'copyDst', 'render' ], data: pixels } );
		return this.tex;

	}

	_build() {

		const r = this.record, gltf = this.gltfs.get( r.kind );
		if ( ! gltf || this.interiorKind === r.kind && this.interior ) return;
		this._releaseVisual();
		const it = this.interior = buildInterior( gltf, { screenTexture: this._texture(), layers: LAYERS.TRANSPARENT } );
		this.interiorKind = r.kind;
		this.group = it.group; this.group.name = 'car-local-cockpit'; this.group.userData.cabinStyle = CABIN_STYLES[ r.kind ]?.id;
		this.app.scene.add( this.group );
		this.wheel = it.nodes.get( 'Wheel' ); this.pedals = [ it.nodes.get( 'Pedal_Gas' ), it.nodes.get( 'Pedal_Brake' ) ].filter( Boolean );
		this.rainRig = rainSetup( it );
		// the driver's arms and legs (first person only): sleeves to the gloves on the rim, trousers to the shoes
		// sleeves and trousers: one batched cloth draw, a colour per limb (a police officer's navy, a driver's denim jacket)
		const cloth = cabinMaterial( 'Cloth_Limbs', { color: new Color( 1, 1, 1 ), batched: true } );
		it.materials.set( 'Cloth_Limbs', cloth );
		this.limbSet = new LimbSet( cloth, this.group );
		const sleeve = r.kind === 'police' ? new Color( 0.03, 0.045, 0.1 ) : new Color( 0.09, 0.12, 0.17 ), trousers = new Color( 0.035, 0.035, 0.045 );
		this.limbs = [ this.limbSet.limb( [ 0.05, 0.042, 0.033 ], sleeve ), this.limbSet.limb( [ 0.05, 0.042, 0.033 ], sleeve ), this.limbSet.limb( [ 0.075, 0.06, 0.045 ], trousers ), this.limbSet.limb( [ 0.075, 0.06, 0.045 ], trousers ) ];
		this.body = [ this.limbSet.mesh ];
		this.group.traverse( ( m ) => { if ( m.isMesh && /Glove|Shoe/.test( m.name ) ) this.body.push( m ); } );
		r.cockpitDetailed = true; this._acc = 1;
		if ( this.app.localLights && ! this._lightsAdded ) { for ( const l of this.lights ) this.app.localLights.add?.( l ); this._lightsAdded = true; }

	}

	_aimAt() {

		const cam = this.app.camera, r = this.cars.drive, input = this.app.input;
		if ( ! cam || ! r?.body || ! this.interior ) return null;
		const o = cam.position.clone(), d = new Vector3(), q = new Quaternion().copy( this.cars.quaternion ).invert();
		let free = false;
		if ( ! input?.locked && ! input?.touchMode && this.mouse && input?.dom?.getBoundingClientRect ) {

			const b = input.dom.getBoundingClientRect();
			if ( b.width && b.height ) { cam.updateMatrixWorld(); d.set( ( this.mouse.x - b.left ) / b.width * 2 - 1, 1 - ( this.mouse.y - b.top ) / b.height * 2, 0.5 ).unproject( cam ).sub( cam.position ).normalize(); free = true; }

		}
		if ( ! free ) d.set( 0, 0, - 1 ).applyQuaternion( cam.quaternion );
		o.sub( new Vector3( r.x, r.y + ( r.bump || 0 ), r.z ) ).applyQuaternion( q ); d.applyQuaternion( q );
		const hit = rayScreens( this.interior, o, d );
		this.aim = hit;
		return hit ? hitControl( hit.screen, hit.u, hit.v, r.kind ) : null;

	}

	_weather() {

		if ( this.rainOverride !== null && this.rainOverride !== undefined ) return this.rainOverride;
		const w = this.cars.features?.get?.( 'weather' ), c = w && w.current;
		return w && Number.isFinite( w.rain ) ? w.rain : c && Number.isFinite( c.rain ) ? c.rain : 0;

	}

	// a parked or idle car you stand beside gets its interior too (look in through the glass)
	_peekTarget() {

		const p = this.app.player;
		if ( this.cars.drive || ! p?.position || ! this.cars._onFoot?.() ) return null;
		let best = null, bd = PEEK;
		for ( const r of this.cars.records ) {

			if ( r.state === 'remote' || r.stage >= 4 || Math.abs( r.speed || 0 ) > 0.5 ) continue;
			const d = Math.hypot( r.x - p.position.x, r.z - p.position.z ) - r.spec.len * 0.35;
			if ( d < bd ) { bd = d; best = r; }

		}
		return best;

	}

	update( dt ) {

		if ( this.disposed ) return;
		this.rain = this._weather();
		const driven = this.cars.drive;
		if ( driven ) this.setRecord( driven, { driven: true } );
		else {

			this._peekT = ( this._peekT || 0 ) - dt;
			if ( this._peekT <= 0 ) { this._peekT = 0.4; this.peek = this.visual ? this._peekTarget() : null; }
			this.setRecord( this.peek, { driven: false } );

		}
		if ( this.isOpen && this.blocked() ) this.close();
		const r = this.record;
		if ( r && ! this.interior && this.gltfs.has( r.kind ) && this.visual && this.app.scene ) this._build();
		const fp = this.firstPerson;
		if ( this.group && r ) this._pose( r, dt, fp );
		const ui = this.app.ui?.ui;
		ui?.root?.classList?.toggle( 'car-cockpit', fp );
		const otherPanel = this.cars.features?.panelOpen?.() && ! this.isOpen;
		const hover = fp && ! this.isOpen && ! otherPanel && ! this.blocked() ? this._aimAt() : null;
		this.hover = hover?.id || null;
		const down = !! ( this.app.input?.mouseDown && this.app.input.enabled !== false );
		if ( down && ! this._lmb && hover ) this.act( hover.id ); this._lmb = down;
		this._acc += dt;
		const every = globalThis.__phoneBudget ? 0.2 : 0.1;
		if ( this._acc >= every && driven ) {

			this._acc = 0; const snap = carPanelSnapshot( this.cars, this.hover ); this.snapshot = snap;
			if ( this.interior && this.ctx && this.tex ) this._upload( snap );
			this._dom();

		}
		if ( this.tip ) { this.tip.hidden = ! fp || this.isOpen || !! otherPanel || this.blocked(); this.tip.textContent = hover ? hover.label + ( hover.key ? ' [' + hover.key + ']' : '' ) + ' · click' : 'Look at the centre console and click a switch · 3 controls'; }

	}

	_upload( snap ) {

		drawInstruments( this.ctx, snap, this.hover ); this.redraws ++;
		if ( ! GPU.device ) return;
		this.tex.getGPU();
		if ( ! GPU.queue?.copyExternalImageToTexture ) this._copyFailed = true;
		if ( GPU.queue?.copyExternalImageToTexture && ! this._copyFailed ) {

			try { GPU.queue.copyExternalImageToTexture( { source: this.canvas }, { texture: this.tex.gpu }, { width: ATLAS.w, height: ATLAS.h } ); }
			catch { this._copyFailed = true; }

		}
		if ( this._copyFailed && this.ctx.getImageData ) {

			const px = this.ctx.getImageData( 0, 0, ATLAS.w, ATLAS.h ).data;
			this.tex.upload( new Uint8Array( px.buffer, px.byteOffset, px.byteLength ) );

		}

	}

	// every moving part from the simulation, the limbs, the cabin light, the rain
	_pose( r, dt, fp ) {

		const it = this.interior, b = r.body, s = systemsOf( r ), driven = this._driven && r === this.cars.drive;
		this.group.position.set( r.x, r.y + ( r.bump || 0 ), r.z );
		if ( driven ) this.group.quaternion.copy( this.cars.quaternion );
		else if ( r.quat ) this.group.quaternion.set( r.quat.x, r.quat.y, r.quat.z, r.quat.w );
		if ( ! it ) return;
		const steer = b?.steer || 0, inp = b?.input || {};
		turnNode( this.wheel, 'z', - steer * ( WHEEL_RATIO[ r.kind ] || 2.6 ) );
		const press = [ inp.throttle || 0, Math.max( inp.brake || 0, r.parkBrake ? 0.15 : 0 ) ];
		this.pedals.forEach( ( p, i ) => turnNode( p, 'x', press[ i ] * 0.32 ) );
		const gear = driven ? drivetrain( r ).gear : 'P';
		turnNode( it.nodes.get( 'Gear' ), r.kind === 'pickup' ? 'z' : 'x', GEAR_ANGLE[ gear[ 0 ] ] ?? GEAR_ANGLE.D );
		turnNode( it.nodes.get( 'Handbrake' ), 'x', r.parkBrake ? - 0.35 : 0 );
		turnNode( it.nodes.get( 'Stalk_Ind' ), 'z', s.ind === 'L' ? 0.2 : s.ind === 'R' ? - 0.2 : 0 );
		turnNode( it.nodes.get( 'Stalk_Wiper' ), 'z', s.wipeSpeed ? - 0.12 * s.wipeSpeed : 0 );
		// wipers: parked along the cowl pointing across (+90 degrees from up the glass), sweeping up
		const sweep = Math.PI / 2 - wiperAngle( s );
		const rig = this.rainRig;
		if ( rig ) rig.wipers.forEach( ( w ) => w && turnNode( w.node, 'z', sweep ) );
		// the body is drawn in the first person only (the chase view's avatar is hidden in a car, so is this)
		for ( const m of this.body ) m.visible = fp && driven;
		if ( fp && driven ) this._limbs( r );
		// light: the dome (switch or the courtesy delay), else a faint dash glow at night with the engine on
		const night = this.cars.night, dome = !! ( s.dome || s.domeT > 0 ), glowOn = night && r.engineOn !== false && driven;
		const L = this.lights[ 0 ];
		L.enabled = dome || glowOn;
		L.intensity = dome ? 14 : glowOn ? 0.8 : 0;
		L.indoor = dome ? 1 : 0; // (the dome lamp also burns by day)
		L.color.setRGB( dome ? 1 : 0.5, dome ? 0.86 : 0.85, dome ? 0.66 : 1 );
		const dp = it.dome || _v.set( 0, r.spec.hgt * 0.85, 0 );
		_w.copy( dp ).applyQuaternion( this.group.quaternion ).add( this.group.position );
		L.position.copy( _w );
		it.set( { cabin: _cabin.setRGB( dome ? 0.05 : glowOn ? 0.004 : 0, dome ? 0.044 : glowOn ? 0.009 : 0, dome ? 0.034 : glowOn ? 0.011 : 0 ), dome: dome ? 1 : r.kind === 'bus' && night && driven ? 0.7 : 0, power: driven ? ( r.engineOn !== false ? 1 : 0.25 ) : 0, glow: driven && r.engineOn !== false ? ( r.kind === 'police' && ! this.cars.siren ? 0.35 : 1 ) : 0 } );
		// rain: the glass up direction, the wipers' pivots and their current angles, the drops' density
		if ( rig && it.rainMesh ) {

			const u = it.rainMesh.material.uniforms, rain = clamp( this.rain, 0, 1 );
			it.rainMesh.visible = rain > 0.01;
			u.glassUp.value.set( rig.up.x, rig.up.y, rig.up.z, rain );
			const ws = rig.wipers, angle = sweep;
			for ( const [ k, w ] of [ [ 'wipeA', ws[ 0 ] ], [ 'wipeB', ws[ 1 ] ] ] ) if ( w ) u[ k ].value.set( w.pivot.x, w.pivot.y, w.pivot.z, angle );
			const omega = s.wipeSpeed ? WIPE.arc / ( ( s.wipeSpeed === 2 ? WIPE.fast : WIPE.normal ) / 2 ) : 0;
			u.params.value.set( omega, this.cars.time || 0, ws[ 0 ]?.reach || 0.5, ws[ 1 ]?.reach || 0.5 );

		}

	}

	_limbs( r ) {

		const it = this.interior, e = r.spec.eye, [ armL, armR, legL, legR ] = this.limbs;
		for ( const [ arm, side, wrist ] of [ [ armL, 1, 'Wrist_L' ], [ armR, - 1, 'Wrist_R' ] ] ) {

			const w = it.point( wrist, _w );
			if ( ! w ) continue;
			const sh = _v.set( e[ 0 ] + side * 0.19, e[ 1 ] - 0.24, e[ 2 ] - 0.1 );
			arm.reach( sh, w, 0.3, 0.29, _h.set( side * 0.8, - 0.6, 0.1 ) );

		}
		for ( const [ leg, side, ankle ] of [ [ legL, 1, 'Ankle_L' ], [ legR, - 1, 'Ankle_R' ] ] ) {

			const a = it.point( ankle, _w );
			if ( ! a ) continue;
			// the hip just over the cushion; the knee bends forward and a little up (low cars: knees under the wheel)
			const hip = _v.set( e[ 0 ] + side * 0.1, r.spec.seat[ 1 ] + ( r.kind === 'bus' ? 0.55 : r.kind === 'sports' ? 0.2 : 0.3 ), e[ 2 ] - 0.1 );
			leg.reach( hip, a, 0.46, 0.44, _h.set( side * 0.12, 0.65, 0.75 ) );

		}
		this.limbSet.commit();

	}

	_dom() {

		const host = this.app.ui?.ui?.hud || this.app.ui?.ui?.root, doc = globalThis.document;
		if ( ! host || ! doc || ! this.cars.drive ) return;
		if ( ! this.el ) {

			if ( ! doc.getElementById( 'car-cockpit-style' ) ) { const style = doc.createElement( 'style' ); style.id = 'car-cockpit-style'; style.textContent = CSS; doc.head.append( style ); }
			this.tip = doc.createElement( 'div' ); this.tip.className = 'car-driver-tip'; this.tip.hidden = true; host.append( this.tip );
			this.el = doc.createElement( 'section' ); this.el.className = 'car-driver-panel tw-interactive'; this.el.setAttribute( 'aria-label', 'Car dashboard controls' ); this.el.hidden = true;
			this.el.innerHTML = '<h2>Driver controls</h2><div class="car-driver-output" role="status"></div><div class="car-driver-grid"></div><p>W/S drive, brake and reverse · A/D steer · Space handbrake · L headlights · H horn · , / . indicators · V camera. Stop before switching the engine. Close this panel to drive.</p><div class="car-driver-message"></div><button class="car-driver-close" data-car-control="close">Close · 3 / Escape</button>';
			this.el.addEventListener( 'click', this._onButton ); host.append( this.el ); this.message = this.el.querySelector( '.car-driver-message' );

		}
		this.el.hidden = ! this.isOpen;
		if ( ! this.isOpen ) return;
		const s = carPanelSnapshot( this.cars );
		this.el.querySelector( '.car-driver-output' ).textContent = `${ s.name } · ${ Math.round( s.speed ) } km/h · ${ s.gear } · ${ Math.round( s.rpm ) } RPM · fuel ${ Math.round( s.fuel * 100 ) }% · ${ Math.round( s.temp ) } °C · ${ Math.round( s.hp ) }% condition`;
		const ctls = controlsFor( s.kind );
		const key = [ s.kind, ...ctls.map( ( c ) => controlState( s, c.id ) ) ].join( '|' );
		if ( key !== this._domKey ) {

			this._domKey = key;
			const focused = doc.activeElement?.dataset?.carControl;
			this.el.querySelector( '.car-driver-grid' ).innerHTML = ctls.map( c => {

				const on = controlOn( s, c.id ), state = controlState( s, c.id );
				return `<button data-car-control="${ c.id }"${ c.id === 'horn' ? '' : ` aria-pressed="${ !! on }"` }>${ c.label }${ c.id === 'horn' ? '' : ' · ' + state.toLowerCase() }</button>`;

			} ).join( '' );
			if ( focused && focused !== 'close' ) this.el.querySelector( `[data-car-control="${ focused }"]` )?.focus();

		}

	}

	_releaseVisual() {

		this.limbSet?.dispose(); this.limbSet = null;
		this.limbs = []; this.body = [];
		if ( this.interior ) this.interior.dispose();
		this.interior = null; this.interiorKind = null; this.group = null; this.wheel = null; this.pedals = []; this.rainRig = null;
		const L = this.lights[ 0 ]; L.enabled = false; L.intensity = 0;

	}

	dispose() {

		this.close(); this.setRecord( null ); this.disposed = true;
		this.tex?.destroy(); this.tex = null;
		if ( this._lightsAdded ) for ( const l of this.lights ) this.app.localLights?.remove?.( l );
		this.app.ui?.ui?.root?.classList?.remove( 'car-cockpit' );
		globalThis.window?.removeEventListener?.( 'mousemove', this._onMove );
		this.el?.removeEventListener?.( 'click', this._onButton ); this.el?.remove(); this.tip?.remove(); this.el = this.tip = null;

	}

}

const _cabin = new Color();
