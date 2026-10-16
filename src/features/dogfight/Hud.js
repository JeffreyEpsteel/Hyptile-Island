// The fighter's HUD (wave 26A), its own DOM layer over the game's (the --tw-* tokens of ui/ui.css with fallbacks):
//   strip      top centre while flying a fighter: speed, altitude, throttle, g, the guns (rounds, barrel heat, cannon
//              shells), the arming switch (a red ARMED pill), the airframe's damage as a little plan view, warnings
//              (STALL, PULL UP, FIRE, GUNS HOT, a bail-out reminder once the aircraft is lost)
//   sight      the reflector gunsight in the cockpit view (a ring and a pip where the guns' line points, at infinity:
//              it moves with the aircraft, not with the head) or a small aim cross in the chase view; the lead indicator
//              (a hollow diamond where to put the pip on the nearest fair target) only when the option is on
//   hit marker a short tick when your rounds land; a red edge flash when you are hit
//   tags       the other fighters: the pilot's name, and a red ARMED badge on those whose guns are armed
//   feed       the kill feed (right side, the last few, fading) and the scoreboard (G while flying, or after a kill)
//
//   const hud = new DogfightHud( app );  hud.update( view )  hud.feed( { killer, victim, airframe, mine } )  hud.dispose()

const CSS = /* css */`
.df-root { position: fixed; inset: 0; pointer-events: none; z-index: 84; font: 500 12px/1.35 var(--tw-font, system-ui, sans-serif); color: var(--tw-ink, #f5ebcd); }
.df-root[hidden] { display: none; }
.df-strip { position: absolute; left: 50%; top: calc(env(safe-area-inset-top, 0px) + 70px); transform: translateX(-50%); display: flex; gap: 12px; align-items: center;
	padding: 6px 12px; border-radius: 10px; background: rgba(12, 28, 32, 0.72); border: 1px solid rgba(163, 199, 185, 0.32); box-shadow: 0 3px 15px rgba(0,0,0,0.3); white-space: nowrap; }
.df-strip[hidden] { display: none; }
.df-num { display: flex; flex-direction: column; align-items: center; min-width: 46px; }
.df-num b { font: 600 15px var(--tw-mono, ui-monospace, monospace); letter-spacing: 0.02em; }
.df-num span { font-size: 10px; color: var(--tw-ink-3, #a9b7b0); text-transform: uppercase; letter-spacing: 0.08em; }
.df-guns { display: grid; gap: 3px; min-width: 92px; }
.df-bar { height: 5px; border-radius: 3px; background: rgba(255,255,255,0.12); overflow: hidden; }
.df-bar > i { display: block; height: 100%; background: var(--tw-aqua, #63d6c8); border-radius: inherit; }
.df-bar.is-heat > i { background: #f0a43a; }
.df-bar.is-hot > i { background: #ff5a3c; }
.df-guns small { font-size: 10px; color: var(--tw-ink-3, #a9b7b0); display: flex; justify-content: space-between; gap: 8px; }
.df-arm { font: 700 11px var(--tw-mono, ui-monospace, monospace); letter-spacing: 0.1em; padding: 3px 8px; border-radius: 999px; background: rgba(255,255,255,0.1); color: var(--tw-ink-3, #a9b7b0); }
.df-arm.is-armed { background: #c3261c; color: #fff; box-shadow: 0 0 10px rgba(230, 40, 30, 0.6); }
.df-arm.is-arming { background: rgba(195, 38, 28, 0.45); color: #fff; }
.df-plan { width: 54px; height: 44px; }
.df-warn { position: absolute; left: 50%; top: calc(env(safe-area-inset-top, 0px) + 128px); transform: translateX(-50%); font: 700 14px var(--tw-mono, ui-monospace, monospace);
	letter-spacing: 0.14em; color: #ff6a4a; text-shadow: 0 1px 6px rgba(0,0,0,0.6); text-align: center; }
.df-warn.is-blink { animation: df-blink 0.5s steps(2) infinite; }
@keyframes df-blink { 50% { opacity: 0.2; } }
.df-sight { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: visible; }
.df-sight svg { position: absolute; overflow: visible; }
.df-lead { position: absolute; left: 0; top: 0; width: 18px; height: 18px; margin: -9px 0 0 -9px; border: 2px solid #ffd35a; transform: rotate(45deg); opacity: 0.9; }
.df-lead[hidden], .df-mark[hidden] { display: none; }
.df-touch { position: absolute; right: calc(env(safe-area-inset-right, 0px) + 18px); bottom: 34%; display: flex; flex-direction: column; gap: 12px; pointer-events: auto; }
.df-touch[hidden] { display: none; }
.df-touch button { width: 76px; height: 76px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.4); background: rgba(160, 30, 20, 0.55); color: #fff;
	font: 700 13px var(--tw-font, system-ui); letter-spacing: 0.08em; touch-action: none; }
.df-touch button.df-arm-btn { width: 56px; height: 56px; background: rgba(12, 28, 32, 0.7); align-self: center; }
.df-touch button.is-on { background: #c3261c; }
.df-hit { position: absolute; left: 50%; top: 50%; width: 26px; height: 26px; margin: -13px 0 0 -13px; opacity: 0; transition: opacity 0.12s; }
.df-hit.is-on { opacity: 1; transition: none; }
.df-hurt { position: absolute; inset: 0; box-shadow: inset 0 0 90px rgba(220, 30, 20, 0.55); opacity: 0; transition: opacity 0.35s; }
.df-hurt.is-on { opacity: 1; transition: none; }
.df-tag { position: absolute; left: 0; top: 0; transform: translate(-50%, -100%); display: flex; gap: 5px; align-items: center; white-space: nowrap; font-size: 11px;
	text-shadow: 0 1px 3px rgba(0,0,0,0.7); }
.df-tag[hidden] { display: none; }
.df-tag i { font-style: normal; font: 700 9px var(--tw-mono, ui-monospace, monospace); letter-spacing: 0.1em; padding: 1px 5px; border-radius: 999px; background: #c3261c; color: #fff; }
.df-feed { position: absolute; right: calc(env(safe-area-inset-right, 0px) + 16px); top: 30%; display: flex; flex-direction: column; gap: 4px; align-items: flex-end; }
.df-feed div { padding: 3px 10px; border-radius: 8px; background: rgba(12, 28, 32, 0.7); border: 1px solid rgba(163, 199, 185, 0.25); transition: opacity 1s; }
.df-feed div.is-mine { border-color: rgba(255, 211, 90, 0.6); }
.df-feed div.is-old { opacity: 0; }
.df-feed b { color: var(--tw-sun, #ffd35a); font-weight: 600; }
.df-board { position: absolute; left: 50%; top: 22%; transform: translateX(-50%); min-width: 240px; padding: 10px 14px; border-radius: 12px; background: rgba(12, 28, 32, 0.82);
	border: 1px solid rgba(163, 199, 185, 0.32); }
.df-board[hidden] { display: none; }
.df-station { position: absolute; left: calc(env(safe-area-inset-left, 0px) + 16px); bottom: 26%; min-width: 230px; max-width: 300px; padding: 8px 12px; border-radius: 10px;
	background: rgba(12, 28, 32, 0.78); border: 1px solid rgba(163, 199, 185, 0.32); font: 500 11.5px/1.5 var(--tw-mono, ui-monospace, monospace); }
.df-station[hidden] { display: none; }
.df-station h4 { margin: 0 0 4px; font: 600 11px var(--tw-font, system-ui); letter-spacing: 0.12em; text-transform: uppercase; color: var(--tw-ink-3, #a9b7b0); }
.df-station .is-bad { color: #ff7a5a; }
.df-station .is-ok { color: #7fd6a0; }
.df-station .is-sel { color: var(--tw-sun, #ffd35a); }
.df-station small { display: block; margin-top: 4px; color: var(--tw-ink-3, #a9b7b0); font-family: var(--tw-font, system-ui); }
.df-dial { position: relative; height: 10px; margin: 5px 0 2px; border-radius: 5px; background: rgba(255,255,255,0.12); }
.df-dial b { position: absolute; top: 0; bottom: 0; border-radius: 5px; background: rgba(127, 214, 160, 0.55); }
.df-dial i { position: absolute; top: -3px; width: 3px; height: 16px; margin-left: -1px; background: #ffd35a; }
.df-mark { position: absolute; left: 0; top: 0; width: 14px; height: 14px; margin: -7px 0 0 -7px; border: 2px solid #ff5a3c; transform: rotate(45deg); }
.df-board h4 { margin: 0 0 6px; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--tw-ink-3, #a9b7b0); }
.df-board table { width: 100%; border-collapse: collapse; font: 500 12px var(--tw-mono, ui-monospace, monospace); }
.df-board td { padding: 2px 6px; }
.df-board tr.is-self td { color: var(--tw-sun, #ffd35a); }
.df-board td:nth-child(n+2) { text-align: right; }
`;

let cssIn = false;
const esc = ( s ) => String( s == null ? '' : s ).replace( /[&<>"']/g, ( c ) => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ c ] ) );
const STAGE_COL = [ '#7fd6a0', '#f0c043', '#f07a3a', '#1a1a1a' ];

// the plan view of the damage: six parts coloured by stage
function planSVG( stages, fire ) {

	const c = ( p ) => STAGE_COL[ stages[ p ] | 0 ];
	return `<svg class="df-plan" viewBox="0 0 54 44" aria-hidden="true">
<path d="M27 2 L30 8 L30 34 L27 40 L24 34 L24 8 Z" fill="${ c( 'fuselage' ) }" opacity="0.9"/>
<rect x="23.5" y="2" width="7" height="8" rx="3" fill="${ c( 'engine' ) }"/>
<path d="M24 14 L3 18 L3 22 L24 22 Z" fill="${ c( 'wingR' ) }"/>
<path d="M30 14 L51 18 L51 22 L30 22 Z" fill="${ c( 'wingL' ) }"/>
<path d="M24 34 L15 37 L15 40 L27 40 L39 40 L39 37 L30 34 Z" fill="${ c( 'tail' ) }"/>
<circle cx="27" cy="16" r="2.4" fill="${ c( 'pilot' ) }" stroke="#0008" stroke-width="0.6"/>
${ fire ? '<circle cx="27" cy="6" r="5" fill="none" stroke="#ff7a2a" stroke-width="1.5"><animate attributeName="r" values="4;6;4" dur="0.6s" repeatCount="indefinite"/></circle>' : '' }
</svg>`;

}

export class DogfightHud {

	constructor( app ) {

		this.app = app;
		this.root = null;
		this.tags = new Map();
		this.feedItems = [];
		this.boardUntil = 0;
		this.boardOn = false;
		this._last = {};
		this._hitT = 0;
		this._hurtT = 0;
		if ( typeof document === 'undefined' || ! document.body ) return;
		if ( ! cssIn ) {

			const st = document.createElement( 'style' );
			st.textContent = CSS;
			document.head.append( st );
			cssIn = true;

		}

		const host = ( app && app.ui && app.ui.ui && ( app.ui.ui.hud || app.ui.ui.root ) ) || document.body;
		const r = this.root = document.createElement( 'div' );
		r.className = 'df-root';
		r.innerHTML = `<div class="df-strip" role="status" aria-label="Fighter instruments" hidden></div><div class="df-warn"></div>
<div class="df-sight"><svg class="df-reticle" width="1" height="1"></svg></div><div class="df-lead" hidden></div>
<svg class="df-hit" viewBox="0 0 26 26"><path d="M3 3 L9 9 M23 3 L17 9 M3 23 L9 17 M23 23 L17 17" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>
<div class="df-hurt"></div><div class="df-feed"></div><div class="df-board" hidden></div><div class="df-station" hidden></div><div class="df-touch" hidden><button class="df-fire-btn">FIRE</button><button class="df-arm-btn">ARM</button></div>`;
		host.append( r );
		this.strip = r.querySelector( '.df-strip' );
		this.warn = r.querySelector( '.df-warn' );
		this.sight = r.querySelector( '.df-sight' );
		this.reticle = r.querySelector( '.df-reticle' );
		this.lead = r.querySelector( '.df-lead' );
		this.hitEl = r.querySelector( '.df-hit' );
		this.hurtEl = r.querySelector( '.df-hurt' );
		this.feedEl = r.querySelector( '.df-feed' );
		this.boardEl = r.querySelector( '.df-board' );
		this.stationEl = r.querySelector( '.df-station' );
		this.marks = [];
		// the phone's buttons: FIRE (held) and ARM (the switch)
		this.touchFire = false;
		this.onArm = null;
		this.touchEl = r.querySelector( '.df-touch' );
		const fireBtn = r.querySelector( '.df-fire-btn' ), armBtn = r.querySelector( '.df-arm-btn' );
		this.armBtn = armBtn;
		if ( fireBtn && fireBtn.addEventListener ) {

			const on = ( e ) => { this.touchFire = true; e && e.preventDefault && e.preventDefault(); };
			const off = () => { this.touchFire = false; };
			fireBtn.addEventListener( 'pointerdown', on );
			for ( const k of [ 'pointerup', 'pointercancel', 'pointerleave' ] ) fireBtn.addEventListener( k, off );
			armBtn.addEventListener( 'pointerdown', ( e ) => { e && e.preventDefault && e.preventDefault(); if ( this.onArm ) this.onArm(); } );

		}
		this.tagLayer = r;

	}

	get size() {

		const w = ( typeof window !== 'undefined' && window.innerWidth ) || 1280, h = ( typeof window !== 'undefined' && window.innerHeight ) || 720;
		return { w, h };

	}

	hit() {

		this._hitT = 0.15;

	}

	hurt() {

		this._hurtT = 0.35;

	}

	feed( e ) {

		if ( ! this.feedEl ) return;
		const d = document.createElement( 'div' );
		if ( e.mine ) d.classList.add( 'is-mine' );
		d.innerHTML = e.killer ? `<b>${ esc( e.killer ) }</b> shot down <b>${ esc( e.victim ) }</b>${ e.airframe ? ' · ' + esc( e.airframe ) : '' }` : `<b>${ esc( e.victim ) }</b> went down${ e.airframe ? ' · ' + esc( e.airframe ) : '' }`;
		this.feedEl.append( d );
		const item = { el: d, t: 0 };
		this.feedItems.push( item );
		while ( this.feedItems.length > 5 ) this.feedItems.shift().el.remove();
		if ( e.mine ) this.boardUntil = 4;

	}

	toggleBoard() {

		this.boardOn = ! this.boardOn;

	}

	// view: { flying, cockpit, speed, alt, throttle, g, guns, armed (0..3), stages, fire, warn, sight: { x, y } | null,
	//         lead: { x, y } | null, tags: [ { id, x, y, name, armed, dist } ], board: [ rows ] | null, dt }
	update( v ) {

		if ( ! this.root ) return;
		const dt = v.dt || 0.016;
		this.root.hidden = ! v.visible;
		// the feed and its fade
		for ( const it of this.feedItems ) {

			it.t += dt;
			if ( it.t > 8 ) it.el.classList.add( 'is-old' );

		}

		while ( this.feedItems.length && this.feedItems[ 0 ].t > 9.5 ) this.feedItems.shift().el.remove();
		this._tags( v.tags || [] );
		this._board( v, dt );
		this._station( v.station || null );
		this._marks( v.marks || [] );
		if ( this.touchEl ) {

			this.touchEl.hidden = ! ( v.flying && v.touch );
			if ( ! v.flying || ! v.touch ) this.touchFire = false;
			if ( this.armBtn && this.armBtn.classList ) this.armBtn.classList.toggle( 'is-on', v.armed === 1 || v.armed === 3 );

		}

		if ( ! v.flying ) {

			this.strip.hidden = true;
			this.warn.textContent = '';
			this.sight.style.display = 'none';
			this.lead.hidden = true;
			return;

		}

		this.strip.hidden = false;
		const g = v.guns || {};
		const armTxt = v.armed === 1 ? 'ARMED' : v.armed === 2 ? 'ARMING' : v.armed === 3 ? 'SAFING' : 'SAFE';
		const armCls = v.armed === 1 || v.armed === 3 ? 'is-armed' : v.armed === 2 ? 'is-arming' : '';
		const heat = Math.round( ( g.heat || 0 ) * 100 );
		const key = [ Math.round( v.speed * 3.6 / 5 ), Math.round( v.alt / 5 ), Math.round( v.throttle * 20 ), Math.round( v.g * 10 ), g.ammo, g.cannon, heat >> 2, g.jammed, armTxt, ( v.stages && Object.values( v.stages ).join( '' ) ), v.fire, v.touch ].join( '|' );
		if ( key !== this._last.strip ) {

			this._last.strip = key;
			const ammoPct = g.ammoMax ? Math.round( g.ammo / g.ammoMax * 100 ) : 0;
			this.strip.innerHTML = `${ planSVG( v.stages || {}, v.fire ) }
<div class="df-num"><b>${ Math.round( v.speed * 3.6 ) }</b><span>km/h</span></div>
<div class="df-num"><b>${ Math.round( v.alt ) }</b><span>alt m</span></div>
<div class="df-num"><b>${ Math.round( v.throttle * 100 ) }%</b><span>thr</span></div>
<div class="df-num"><b>${ v.g.toFixed( 1 ) }</b><span>g</span></div>
<div class="df-guns"><small><span>guns ${ g.ammo ?? 0 }</span>${ g.cannon != null ? `<span>cannon ${ g.cannon }</span>` : '' }</small>
<div class="df-bar"><i style="width:${ ammoPct }%"></i></div><div class="df-bar is-heat${ g.jammed || heat > 80 ? ' is-hot' : '' }"><i style="width:${ heat }%"></i></div></div>
<span class="df-arm ${ armCls }">${ armTxt }</span>`;

		}

		if ( v.warn !== this._last.warn ) {

			this._last.warn = v.warn;
			this.warn.textContent = v.warn || '';
			this.warn.classList.toggle( 'is-blink', !! v.warn && /STALL|PULL UP|FIRE/.test( v.warn ) );

		}

		// the sight: a ring and a pip in the cockpit, a small cross outside
		if ( v.sight ) {

			this.sight.style.display = '';
			this.sight.style.transform = `translate(${ v.sight.x.toFixed( 1 ) }px, ${ v.sight.y.toFixed( 1 ) }px)`;
			const r = Math.max( 18, v.sight.r || 40 );
			const sk = ( v.cockpit ? 'c' : 'x' ) + Math.round( r );
			if ( sk !== this._last.sight ) {

				this._last.sight = sk;
				const col = 'rgba(255, 196, 92, 0.92)';
				this.reticle.setAttribute( 'style', `left:${ - r - 4 }px; top:${ - r - 4 }px` );
				this.reticle.setAttribute( 'width', 2 * r + 8 );
				this.reticle.setAttribute( 'height', 2 * r + 8 );
				const c = r + 4;
				this.reticle.innerHTML = v.cockpit
					? `<circle cx="${ c }" cy="${ c }" r="${ r }" fill="none" stroke="${ col }" stroke-width="1.6"/><circle cx="${ c }" cy="${ c }" r="1.8" fill="${ col }"/>
<path d="M${ c - r - 2 } ${ c } h${ r * 0.35 } M${ c + r + 2 } ${ c } h${ - r * 0.35 } M${ c } ${ c + r + 2 } v${ - r * 0.3 }" stroke="${ col }" stroke-width="1.6"/>`
					: `<path d="M${ c - 9 } ${ c } h6 M${ c + 9 } ${ c } h-6 M${ c } ${ c - 9 } v6 M${ c } ${ c + 9 } v-6" stroke="${ col }" stroke-width="2" stroke-linecap="round"/><circle cx="${ c }" cy="${ c }" r="1.6" fill="${ col }"/>`;

			}

		} else this.sight.style.display = 'none';

		if ( v.lead ) {

			this.lead.hidden = false;
			this.lead.style.transform = `translate(${ v.lead.x.toFixed( 1 ) }px, ${ v.lead.y.toFixed( 1 ) }px) rotate(45deg)`;

		} else this.lead.hidden = true;

		this._hitT = Math.max( 0, this._hitT - dt );
		this._hurtT = Math.max( 0, this._hurtT - dt );
		this.hitEl.classList.toggle( 'is-on', this._hitT > 0 );
		this.hurtEl.classList.toggle( 'is-on', this._hurtT > 0 );

	}

	_tags( list ) {

		const seen = new Set();
		for ( const t of list ) {

			seen.add( t.id );
			let el = this.tags.get( t.id );
			if ( ! el ) {

				el = document.createElement( 'div' );
				el.className = 'df-tag';
				this.tagLayer.append( el );
				this.tags.set( t.id, el );

			}

			const html = `${ esc( t.name ) }${ t.armed ? '<i>ARMED</i>' : '' }`;
			if ( el._html !== html ) {

				el.innerHTML = html;
				el._html = html;

			}

			el.hidden = false;
			el.style.opacity = t.fade == null ? 1 : t.fade.toFixed( 2 );
			el.style.transform = `translate(${ t.x.toFixed( 1 ) }px, ${ t.y.toFixed( 1 ) }px) translate(-50%, -100%)`;

		}

		for ( const [ id, el ] of this.tags ) if ( ! seen.has( id ) ) {

			el.remove();
			this.tags.delete( id );

		}

	}

	// a crew station's panel: { title, rows: [ { text, cls } ], dial: { needle, band } | null, progress 0..1 | null, keys }
	_station( st ) {

		if ( ! this.stationEl ) return;
		this.stationEl.hidden = ! st;
		if ( ! st ) return;
		const dial = st.dial ? `<div class="df-dial"><b style="left:${ ( ( 0.5 - st.dial.band ) * 100 ).toFixed( 1 ) }%;width:${ ( st.dial.band * 200 ).toFixed( 1 ) }%"></b><i style="left:${ ( st.dial.needle * 100 ).toFixed( 1 ) }%"></i></div>` : '';
		const prog = st.progress != null ? `<div class="df-bar"><i style="width:${ Math.round( st.progress * 100 ) }%"></i></div>` : '';
		const html = `<h4>${ esc( st.title ) }</h4>${ st.rows.map( ( r ) => `<div class="${ r.cls || '' }">${ esc( r.text ) }</div>` ).join( '' ) }${ dial }${ prog }${ st.keys ? `<small>${ esc( st.keys ) }</small>` : '' }`;
		if ( html !== this._last.station ) {

			this._last.station = html;
			this.stationEl.innerHTML = html;

		}

	}

	// spotted targets: a red diamond on each ( [ { x, y } ] )
	_marks( list ) {

		while ( this.marks.length < list.length ) {

			const el = document.createElement( 'div' );
			el.className = 'df-mark';
			this.tagLayer.append( el );
			this.marks.push( el );

		}

		this.marks.forEach( ( el, i ) => {

			const m = list[ i ];
			el.hidden = ! m;
			if ( m ) el.style.transform = `translate(${ m.x.toFixed( 1 ) }px, ${ m.y.toFixed( 1 ) }px) rotate(45deg)`;

		} );

	}

	_board( v, dt ) {

		this.boardUntil = Math.max( 0, this.boardUntil - dt );
		const show = !! v.board && v.board.length && ( this.boardOn || this.boardUntil > 0 );
		this.boardEl.hidden = ! show;
		if ( ! show ) return;
		const html = `<h4>Air combat · this session</h4><table>${ v.board.map( ( r ) => `<tr class="${ r.self ? 'is-self' : '' }"><td>${ esc( r.name ) }</td><td>${ r.kills }</td><td>${ r.deaths }</td></tr>` ).join( '' ) }</table>`;
		if ( html !== this._last.board ) {

			this._last.board = html;
			this.boardEl.innerHTML = html;

		}

	}

	dispose() {

		if ( this.root ) this.root.remove();
		this.root = null;
		this.tags.clear();

	}

}
