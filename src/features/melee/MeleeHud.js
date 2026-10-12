import { Vector3 } from '../../engine/index.js';

// DOM for the melee feature (class prefix ml-), laid over the game's HUD element the way
// src/net/RemotePlayers.js lays its name tags: one root (pointer-events none) holding
//   - a projected tag over each raider within TAG_RANGE of the player: name, health bar, and the "!" that
//     shows during his wind-up
//   - the player's health bar (bottom left, fades in when hurt or in a fight)
//   - a hint line (controls on the first fight, "put the rod away" when it is out), a red hurt vignette, a
//     black fade for the knockdown / respawn cut, and floating damage numbers
//   - (wave 4) a subtle lock-on reticle (four corner ticks) on the soft-lock target, and the "!" turning gold in the
//     parry window (r.parryCue > 0)
// Everything is a no-op without a document or a HUD element (headless tests pass a fake `doc`).
//
//   const hud = new MeleeHud( { hud: hudElement, camera } );
//   hud.update( dt, { raiders, player: { x, z }, hp, maxHp, guarding, hint, fade, hurt, lock } );
//   hud.pop( 'PUNISH 51', { x, y, z }, 'punish' );
//   hud.dispose()

export const TAG_RANGE = 15; // m from the player
export const TAG_FADE = 12; // m: fully opaque inside this
const POP_LIFE = 0.95; // s
const POP_MAX = 10;

const CSS = /* css */`
.ml-root { position: absolute; left: 0; top: 0; right: 0; bottom: 0; pointer-events: none; overflow: hidden; }
.ml-tag { position: absolute; left: 0; top: 0; transform: translate(-50%, -100%); display: flex; flex-direction: column; align-items: center;
	gap: calc(3 * var(--tw-u, 1px)); font: 600 var(--tw-fs-sm, 11.5px) var(--tw-font, system-ui, sans-serif); color: var(--tw-ink, #eef6f8);
	text-shadow: 0 1px 3px rgba(0, 0, 0, 0.75); white-space: nowrap; will-change: transform, opacity; letter-spacing: 0.02em; }
.ml-tag.is-hidden { display: none; }
.ml-tag.is-captain .ml-name { color: var(--tw-sun, #ffb86b); }
.ml-bar { display: block; width: calc(64 * var(--tw-u, 1px)); height: calc(6 * var(--tw-u, 1px)); border-radius: 99px; overflow: hidden;
	background: rgba(8, 12, 18, 0.62); box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.16); }
.ml-bar > span { display: block; height: 100%; width: 100%; border-radius: inherit; background: var(--tw-coral, #ff7a85); transition: width 140ms ease-out; }
.ml-tag.is-captain .ml-bar { width: calc(88 * var(--tw-u, 1px)); }
.ml-alert { position: absolute; left: 50%; bottom: 100%; margin-bottom: calc(2 * var(--tw-u, 1px)); transform: translateX(-50%) scale(0.5); opacity: 0;
	font: 900 calc(30 * var(--tw-u, 1px)) var(--tw-font, system-ui, sans-serif); line-height: 1; color: #ff3b2f; text-shadow: 0 0 10px rgba(255, 40, 20, 0.9), 0 1px 2px #000;
	transition: opacity 80ms, transform 120ms; }
.ml-tag.is-alert .ml-alert { opacity: 1; transform: translateX(-50%) scale(1); animation: ml-throb 0.22s ease-in-out infinite alternate; }
.ml-tag.is-down { opacity: 0.45 !important; }
.ml-tag.is-parry .ml-alert { color: #ffd23a; text-shadow: 0 0 12px rgba(255, 200, 40, 0.95), 0 1px 2px #000; }
.ml-lock { position: absolute; left: 0; top: 0; width: calc(34 * var(--tw-u, 1px)); height: calc(34 * var(--tw-u, 1px)); opacity: 0;
	transition: opacity 160ms ease; will-change: transform, opacity; }
.ml-lock.is-on { opacity: 0.7; }
.ml-lock i { position: absolute; width: 28%; height: 28%; border: 0 solid rgba(255, 255, 255, 0.85); filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.7)); }
.ml-lock i:nth-child(1) { left: 0; top: 0; border-left-width: 2px; border-top-width: 2px; }
.ml-lock i:nth-child(2) { right: 0; top: 0; border-right-width: 2px; border-top-width: 2px; }
.ml-lock i:nth-child(3) { left: 0; bottom: 0; border-left-width: 2px; border-bottom-width: 2px; }
.ml-lock i:nth-child(4) { right: 0; bottom: 0; border-right-width: 2px; border-bottom-width: 2px; }
.ml-lock.is-alert i { border-color: #ff6a4a; }
@keyframes ml-throb { to { transform: translateX(-50%) scale(1.25); } }
.ml-player { position: absolute; left: var(--tw-edge, 16px); bottom: calc(var(--tw-edge, 16px) + 96 * var(--tw-u, 1px)); display: flex; align-items: center;
	gap: var(--tw-2, 8px); padding: calc(5 * var(--tw-u, 1px)) var(--tw-3, 12px); border-radius: 999px; background: var(--tw-glass, rgba(12, 18, 26, 0.62));
	font: 600 var(--tw-fs-sm, 11.5px) var(--tw-font, system-ui, sans-serif); color: var(--tw-ink, #eef6f8); opacity: 0; transition: opacity 240ms ease; }
.ml-player.is-on { opacity: 1; }
.ml-player .ml-bar { width: calc(150 * var(--tw-u, 1px)); height: calc(8 * var(--tw-u, 1px)); }
.ml-player .ml-bar > span { background: linear-gradient(90deg, #ff7a85, #ffb86b); }
.ml-player.is-low .ml-bar > span { background: #ff3b2f; }
.ml-player.is-guard::after { content: 'GUARD'; font-size: var(--tw-fs-xs, 10.5px); letter-spacing: 0.12em; color: var(--tw-aqua, #5fe3d4); }
.ml-hp { font-family: var(--tw-mono, ui-monospace, monospace); min-width: 3ch; text-align: right; }
.ml-hint { position: absolute; left: 50%; top: 17vh; transform: translateX(-50%); padding: calc(6 * var(--tw-u, 1px)) var(--tw-4, 16px); border-radius: 999px;
	background: var(--tw-glass, rgba(12, 18, 26, 0.62)); font: 500 var(--tw-fs-md, 12.5px) var(--tw-font, system-ui, sans-serif); color: var(--tw-ink, #eef6f8);
	white-space: nowrap; opacity: 0; transition: opacity 300ms ease; }
.ml-hint.is-on { opacity: 1; }
.ml-hint kbd { font: 600 var(--tw-fs-sm, 11.5px) var(--tw-mono, monospace); padding: 0 calc(5 * var(--tw-u, 1px)); border-radius: 4px; background: rgba(255, 255, 255, 0.14); }
.ml-hurt { position: absolute; left: 0; top: 0; right: 0; bottom: 0; opacity: 0;
	background: radial-gradient(ellipse at center, rgba(160, 10, 10, 0) 52%, rgba(190, 18, 18, 0.62) 100%); }
.ml-fade { position: absolute; left: 0; top: 0; right: 0; bottom: 0; background: #000; opacity: 0; }
.ml-pop { position: absolute; left: 0; top: 0; font: 800 var(--tw-fs-lg, 14px) var(--tw-font, system-ui, sans-serif); color: #fff; text-shadow: 0 1px 3px #000, 0 0 8px rgba(0, 0, 0, 0.6);
	white-space: nowrap; animation: ml-rise ${ POP_LIFE }s ease-out forwards; }
.ml-pop.is-dmg { color: var(--tw-coral, #ff7a85); }
.ml-pop.is-punish { color: var(--tw-sun, #ffb86b); font-size: calc(1.25 * var(--tw-fs-lg, 14px)); }
.ml-pop.is-block, .ml-pop.is-dodge { color: var(--tw-aqua, #5fe3d4); }
.ml-pop.is-parry { color: #ffd23a; font-size: calc(1.35 * var(--tw-fs-lg, 14px)); letter-spacing: 0.06em; }
.ml-pop.is-chip { color: #ffb0a0; }
.ml-pop.is-hurt { color: #ff3b2f; font-size: calc(1.25 * var(--tw-fs-lg, 14px)); }
@keyframes ml-rise { from { opacity: 1; margin-top: 0; } 70% { opacity: 1; } to { opacity: 0; margin-top: calc(-46 * var(--tw-u, 1px)); } }
`;

let cssInjected = false;
const _v = new Vector3(), _v2 = new Vector3();

// project a world point with the camera's matrices: { x, y } in pixels of a w x h box, plus view-space distance;
// null when behind the camera or well off screen
export function project( camera, world, w, h, out = {} ) {

	_v.set( world.x, world.y, world.z ).applyMatrix4( camera.matrixWorldInverse ); // view space: the camera looks down -z
	const dist = _v.length();
	if ( _v.z >= - 0.1 ) return null;
	_v2.copy( _v ).applyMatrix4( camera.projectionMatrix );
	if ( _v2.x < - 1.2 || _v2.x > 1.2 || _v2.y < - 1.2 || _v2.y > 1.2 ) return null;
	out.x = ( _v2.x * 0.5 + 0.5 ) * w;
	out.y = ( 0.5 - _v2.y * 0.5 ) * h;
	out.dist = dist;
	return Number.isFinite( out.x ) && Number.isFinite( out.y ) ? out : null;

}

const esc = ( s ) => String( s == null ? '' : s ).replace( /[&<>"']/g, ( c ) => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ c ] ) );

export class MeleeHud {

	constructor( { hud = null, camera = null, doc = ( typeof document !== 'undefined' ? document : null ) } = {} ) {

		this.camera = camera;
		this.doc = doc;
		this.hud = hud;
		this.root = null;
		this.tags = new Map(); // raider id -> { el, name, fill, shownName }
		this.pops = []; // { el, age }
		this._pt = {};
		this._head = new Vector3();
		if ( ! doc || ! hud ) return;
		if ( ! cssInjected && doc.head ) {

			const style = doc.createElement( 'style' );
			style.textContent = CSS;
			doc.head.append( style );
			cssInjected = true;

		}

		const mk = ( tag, cls, html = '' ) => {

			const e = doc.createElement( tag );
			e.className = cls;
			if ( html ) e.innerHTML = html;
			return e;

		};

		this.mk = mk;
		this.root = mk( 'div', 'ml-root' );
		this.hurtEl = mk( 'div', 'ml-hurt' );
		this.playerEl = mk( 'div', 'ml-player tw-glass', '<b>HP</b><span class="ml-bar"><span></span></span><span class="ml-hp">100</span>' );
		this.hpFill = this.playerEl.querySelector ? this.playerEl.querySelector( '.ml-bar > span' ) : null;
		this.hpNum = this.playerEl.querySelector ? this.playerEl.querySelector( '.ml-hp' ) : null;
		this.hintEl = mk( 'div', 'ml-hint tw-glass' );
		this.fadeEl = mk( 'div', 'ml-fade' );
		this.lockEl = mk( 'div', 'ml-lock', '<i></i><i></i><i></i><i></i>' );
		this.root.append( this.hurtEl, this.lockEl, this.playerEl, this.hintEl, this.fadeEl );
		this._lockOn = false;
		hud.append( this.root );
		this._hint = '';

	}

	get enabled() {

		return !! this.root;

	}

	_tag( r ) {

		let t = this.tags.get( r.id );
		if ( t ) return t;
		const el = this.mk( 'div', 'ml-tag is-hidden', '<i class="ml-alert">!</i><b class="ml-name"></b><span class="ml-bar"><span></span></span>' );
		t = { el, name: el.querySelector ? el.querySelector( '.ml-name' ) : null, fill: el.querySelector ? el.querySelector( '.ml-bar > span' ) : null, shownName: null, kind: null };
		this.root.append( el );
		this.tags.set( r.id, t );
		return t;

	}

	// view: { raiders, player: { x, z }, hp, maxHp, guarding, hint (html string or ''), fade 0..1, hurt 0..1, showPlayer (bool) }
	update( dt, view ) {

		if ( ! this.root ) return;
		const cam = this.camera;
		if ( cam && cam.updateMatrixWorld ) cam.updateMatrixWorld( true );
		const w = this.root.clientWidth || ( typeof window !== 'undefined' ? window.innerWidth : 1280 );
		const h = this.root.clientHeight || ( typeof window !== 'undefined' ? window.innerHeight : 720 );
		const p = view.player;
		for ( const r of view.raiders ) {

			const t = this._tag( r );
			const el = t.el;
			const d = Math.hypot( r.x - p.x, r.z - p.z );
			const show = r.active && r.visible && r.state !== 'gone' && d <= TAG_RANGE && cam;
			let pt = null;
			if ( show ) {

				r.headPosition( this._head );
				this._head.y += 0.35;
				pt = project( cam, this._head, w, h, this._pt );

			}

			if ( ! pt ) {

				el.classList.add( 'is-hidden' );
				continue;

			}

			if ( t.shownName !== r.name && t.name ) { t.name.textContent = r.name; t.shownName = r.name; }
			if ( t.kind !== r.kind ) { el.classList.toggle( 'is-captain', r.kind === 'captain' ); t.kind = r.kind; }
			const down = r.state === 'down' || r.state === 'getup' || r.state === 'flee';
			el.classList.remove( 'is-hidden' );
			el.classList.toggle( 'is-alert', !! r.alert );
			el.classList.toggle( 'is-parry', ( r.parryCue || 0 ) > 0 );
			el.classList.toggle( 'is-down', down );
			if ( t.fill ) t.fill.style.width = `${ Math.max( 0, Math.min( 100, ( r.hp / r.maxHp ) * 100 ) ).toFixed( 1 ) }%`;
			el.style.opacity = ( d <= TAG_FADE ? 1 : 1 - ( d - TAG_FADE ) / ( TAG_RANGE - TAG_FADE ) ).toFixed( 2 );
			const scale = 0.8 + 0.2 * Math.min( 1, 10 / Math.max( 1, pt.dist ) );
			el.style.transform = `translate(${ pt.x.toFixed( 1 ) }px, ${ pt.y.toFixed( 1 ) }px) translate(-50%, -100%) scale(${ scale.toFixed( 3 ) })`;

		}

		// the lock-on reticle: on the target's chest
		const lk = view.lock;
		let lockPt = null;
		if ( lk && cam && lk.headPosition ) {

			lk.headPosition( this._head );
			this._head.y -= 0.55;
			lockPt = project( cam, this._head, w, h, this._pt );

		}

		if ( lockPt ) {

			this.lockEl.style.transform = `translate(${ lockPt.x.toFixed( 1 ) }px, ${ lockPt.y.toFixed( 1 ) }px) translate(-50%, -50%)`;
			this.lockEl.classList.toggle( 'is-alert', !! lk.alert );

		}

		if ( !! lockPt !== this._lockOn ) {

			this._lockOn = !! lockPt;
			this.lockEl.classList.toggle( 'is-on', this._lockOn );

		}

		// the player's bar
		const frac = Math.max( 0, Math.min( 1, view.hp / view.maxHp ) );
		this.playerEl.classList.toggle( 'is-on', !! view.showPlayer );
		this.playerEl.classList.toggle( 'is-low', frac < 0.3 );
		this.playerEl.classList.toggle( 'is-guard', !! view.guarding );
		if ( this.hpFill ) this.hpFill.style.width = `${ ( frac * 100 ).toFixed( 1 ) }%`;
		if ( this.hpNum ) this.hpNum.textContent = String( Math.ceil( view.hp ) );
		const hint = view.hint || '';
		if ( hint !== this._hint ) {

			this._hint = hint;
			if ( hint ) this.hintEl.innerHTML = hint;
			this.hintEl.classList.toggle( 'is-on', !! hint );

		}

		this.hurtEl.style.opacity = Math.max( 0, Math.min( 1, view.hurt || 0 ) ).toFixed( 2 );
		this.fadeEl.style.opacity = Math.max( 0, Math.min( 1, view.fade || 0 ) ).toFixed( 3 );

		// floating numbers
		for ( let i = this.pops.length - 1; i >= 0; i -- ) {

			const pop = this.pops[ i ];
			pop.age += dt;
			if ( pop.age >= POP_LIFE ) {

				pop.el.remove();
				this.pops.splice( i, 1 );

			}

		}

	}

	// a floating label at a world position (kind: dmg | punish | block | dodge | hurt)
	pop( text, at, kind = 'dmg' ) {

		if ( ! this.root || ! this.camera ) return null;
		const w = this.root.clientWidth || ( typeof window !== 'undefined' ? window.innerWidth : 1280 );
		const h = this.root.clientHeight || ( typeof window !== 'undefined' ? window.innerHeight : 720 );
		const pt = project( this.camera, at, w, h, {} );
		if ( ! pt ) return null;
		while ( this.pops.length >= POP_MAX ) this.pops.shift().el.remove();
		const el = this.mk( 'div', 'ml-pop is-' + kind );
		el.textContent = text;
		el.style.transform = `translate(${ ( pt.x + ( Math.random() - 0.5 ) * 24 ).toFixed( 1 ) }px, ${ pt.y.toFixed( 1 ) }px) translate(-50%, -100%)`;
		this.root.append( el );
		const pop = { el, age: 0, text, kind };
		this.pops.push( pop );
		return pop;

	}

	dispose() {

		if ( this.root ) this.root.remove();
		this.root = null;
		this.tags.clear();
		this.pops.length = 0;

	}

}

export { esc };
