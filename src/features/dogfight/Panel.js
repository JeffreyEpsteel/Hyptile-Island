// The warbird dispersal's window (wave 26A), the glass panel of the harbour's kit (PanelKit.js):
//   'shop'   E at the dispersal tent of an airstrip: the fighters and the crewed aircraft (buy, fly from here, ferry here,
//            rebuild after a loss, repair, rearm), the options (lead indicator, gun convergence, AI gunners), practice
//            sorties (single player: target drones, Blackwater raiders) and the air combat board
//   'seats'  the seat picker: E at the door of a crewed aircraft (yours, or another player's standing on the ground), or a
//            seat key in flight: each seat, its role and who sits there; a click takes a free one
// Everything it shows comes from dogfight.view() / seatView(); the buttons call dogfight.act( id, arg ).

import { GlassPanel, esc, money } from '../harbour/PanelKit.js';
import { WARBIRDS, FIGHTER_IDS, CREWED_IDS, ROLE_NAMES } from './Warbirds.js';
import { CONVERGENCE } from './Guns.js';

const CSS = /* css */`
.df-panel { width: min(calc(560 * var(--tw-u)), calc(100vw - 2 * var(--tw-edge))); }
.df-panel h2 { margin: 0 0 2px; font-size: calc(17 * var(--tw-u)); font-weight: 600; }
.df-panel .df-sub { margin: 0; color: var(--tw-ink-3); font-size: var(--tw-fs-sm); }
.df-tabs { display: flex; gap: var(--tw-2); margin: var(--tw-3) 0; flex-wrap: wrap; }
.df-btn { font: 600 var(--tw-fs-sm) var(--tw-font); color: var(--tw-ink); background: var(--tw-fill-2); border: 0; border-radius: 999px; padding: var(--tw-1) var(--tw-3); cursor: pointer; white-space: nowrap; }
.df-btn:hover:not([disabled]) { background: var(--tw-line-2); }
.df-btn.is-on { color: var(--tw-aqua); box-shadow: inset 0 0 0 1px rgba(var(--tw-aqua-rgb), 0.55); }
.df-btn.is-main { color: var(--tw-sun); box-shadow: inset 0 0 0 1px rgba(var(--tw-sun-rgb), 0.5); }
.df-btn[disabled] { opacity: 0.35; cursor: default; }
.df-list { display: grid; gap: var(--tw-2); max-height: calc(100vh - 260 * var(--tw-u)); overflow: auto; }
.df-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--tw-2) var(--tw-3); padding: var(--tw-2) var(--tw-3); border-radius: var(--tw-r-md); background: var(--tw-fill); border: 1px solid var(--tw-line); }
.df-row b { font-weight: 600; }
.df-row small { display: block; color: var(--tw-ink-3); font-size: var(--tw-fs-xs); line-height: 1.4; }
.df-row .df-acts { display: flex; gap: var(--tw-1); flex-wrap: wrap; justify-content: flex-end; align-items: center; }
.df-row .df-price { font: 600 var(--tw-fs-md) var(--tw-mono); color: var(--tw-sun); }
.df-opt { display: flex; justify-content: space-between; align-items: center; gap: var(--tw-3); padding: var(--tw-2) 0; border-bottom: 1px solid var(--tw-line); font-size: var(--tw-fs-sm); }
.df-msg { min-height: 1.4em; margin-top: var(--tw-2); color: var(--tw-ink-3); font-size: var(--tw-fs-sm); }
.df-msg.is-bad { color: var(--tw-coral); }
.df-panel table { width: 100%; border-collapse: collapse; font: 500 var(--tw-fs-sm) var(--tw-mono); }
.df-panel td { padding: 3px 6px; border-bottom: 1px solid var(--tw-line); }
.df-panel td:nth-child(n+2) { text-align: right; }
`;
let cssIn = false;

export class DogfightPanel extends GlassPanel {

	constructor( dogfight ) {

		super( dogfight.app );
		this.df = dogfight;
		this.mode = 'shop';
		this.tab = 'fighters';
		this.strip = null;
		this.seatTarget = null; // { owner: 'me' | peer id }
		this.msg = null;

	}

	_ensure() {

		const ok = super._ensure();
		if ( ok && this.el && ! this.el.classList.contains( 'df-panel' ) ) {

			this.el.classList.add( 'df-panel' );
			if ( ! cssIn ) {

				const st = document.createElement( 'style' );
				st.textContent = CSS;
				document.head.append( st );
				cssIn = true;

			}

		}

		return ok;

	}

	openShop( strip, tab = null ) {

		this.mode = 'shop';
		this.strip = strip;
		if ( tab ) this.tab = tab;
		this.msg = null;
		return this.open();

	}

	openSeats( target ) {

		this.mode = 'seats';
		this.seatTarget = target;
		this.msg = null;
		return this.open();

	}

	say( r ) {

		if ( r && r.text ) this.msg = { text: r.text, bad: ! r.ok };

	}

	render() {

		return this.mode === 'seats' ? this._seats() : this._shop();

	}

	_msg() {

		return `<div class="df-msg${ this.msg && this.msg.bad ? ' is-bad' : '' }">${ this.msg ? esc( this.msg.text ) : '' }</div>`;

	}

	_shop() {

		const v = this.df.view( this.strip );
		const tabs = [ [ 'fighters', 'Fighters' ], [ 'crewed', 'Crewed aircraft' ], [ 'options', 'Options & practice' ], [ 'board', 'Air combat' ] ];
		let body = '';
		if ( this.tab === 'fighters' || this.tab === 'crewed' ) {

			const ids = this.tab === 'fighters' ? FIGHTER_IDS : CREWED_IDS;
			body = `<div class="df-list">${ ids.map( ( id ) => this._row( id, v.fleet[ id ], v ) ).join( '' ) }</div>`;

		} else if ( this.tab === 'options' ) {

			const o = v.options;
			body = `<div class="df-opt"><span>Lead indicator (where to aim at a crossing target)</span><button class="df-btn ${ o.lead ? 'is-on' : '' }" data-act="lead">${ o.lead ? 'On' : 'Off' }</button></div>
<div class="df-opt"><span>Gun convergence (where the wing guns' fire meets)</span><span>${ CONVERGENCE.map( ( c ) => `<button class="df-btn ${ o.cv === c ? 'is-on' : '' }" data-act="cv" data-v="${ c }">${ c } m</button>` ).join( ' ' ) }</span></div>
<div class="df-opt"><span>AI gunners in empty gun seats (single player)</span><button class="df-btn ${ o.aiGunners ? 'is-on' : '' }" data-act="aiGunners">${ o.aiGunners ? 'On' : 'Off' }</button></div>
<div class="df-opt"><span>Practice: three target drones circling the strip</span><button class="df-btn" data-act="drones" ${ v.online ? 'disabled' : '' }>Launch</button></div>
<div class="df-opt"><span>Practice: Blackwater raiders come for you (a bounty each)</span><button class="df-btn" data-act="raiders" ${ v.online ? 'disabled' : '' }>Call them</button></div>
<small class="df-sub">${ v.online ? 'Practice sorties are for single player. Online, only players with their guns armed can fight each other.' : 'Arm your guns (R) before you shoot: an armed fighter is fair game for raiders too.' }</small>`;

		} else {

			body = v.board && v.board.length
				? `<table>${ [ '<tr><td>Pilot</td><td>Kills</td><td>Losses</td></tr>', ...v.board.map( ( r ) => `<tr><td>${ esc( r.name ) }${ r.self ? ' (you)' : '' }</td><td>${ r.kills }</td><td>${ r.deaths }</td></tr>` ) ].join( '' ) }</table>`
				: `<p class="df-sub">Your record: ${ v.score[ 0 ] } shot down, ${ v.score[ 1 ] } lost. ${ v.online ? 'Nobody in this room has fought yet.' : 'Online, armed players show here.' }</p>`;

		}

		return `<div class="hb-head"><div><h2>Warbird dispersal${ v.stripName ? ' · ' + esc( v.stripName ) : '' }</h2><p class="df-sub">Money ${ money( v.money ) }${ v.free ? ' · sandbox: free' : '' }</p></div><button class="df-btn" data-act="close">Close</button></div>
<div class="df-tabs">${ tabs.map( ( [ k, n ] ) => `<button class="df-btn ${ this.tab === k ? 'is-on' : '' }" data-act="tab" data-v="${ k }">${ n }</button>` ).join( '' ) }</div>${ body }${ this._msg() }`;

	}

	_row( id, r, v ) {

		const W = WARBIRDS[ id ];
		const crew = W.seats.map( ( s ) => ROLE_NAMES[ s.role ] ).join( ', ' );
		const guns = W.guns.length ? `${ W.guns.length } ${ W.guns.some( ( g ) => g.kind === 'cannon' ) ? 'guns and cannon' : W.guns[ 0 ].kind === 'heavy' ? 'heavy guns' : 'light guns' }` : 'no fixed guns';
		const turrets = W.turrets.length ? ` · ${ W.turrets.length } turret${ W.turrets.length > 1 ? 's' : '' }` : '';
		const stats = `${ W.role } · ${ Math.round( r.vmax * 3.6 ) } km/h · ${ guns }${ turrets }${ W.bomb ? ' · a bomb' : '' }`;
		const acts = [];
		if ( ! r.owned ) acts.push( `<span class="df-price">${ money( W.price ) }</span><button class="df-btn is-main" data-act="buy" data-v="${ id }">Buy</button>` );
		else if ( r.lost ) acts.push( `<button class="df-btn is-main" data-act="rebuild" data-v="${ id }">Rebuild ${ money( r.rebuild ) }</button>` );
		else {

			if ( r.here ) acts.push( `<button class="df-btn is-main" data-act="fly" data-v="${ id }">${ W.crew > 1 ? 'Board' : 'Fly' }</button>` );
			else if ( r.at !== 'out' ) acts.push( `<button class="df-btn" data-act="ferry" data-v="${ id }">Ferry here ${ money( r.ferry ) }</button>` );
			if ( r.repair > 0 ) acts.push( `<button class="df-btn" data-act="repair" data-v="${ id }">Repair ${ money( r.repair ) }</button>` );
			if ( r.rearm ) acts.push( `<button class="df-btn" data-act="rearm" data-v="${ id }">Rearm ${ money( r.rearmCost ) }</button>` );

		}

		const where = r.owned ? ( r.lost ? 'Lost: rebuild it here' : r.at === 'out' ? 'Out flying' : r.here ? 'Yours, on this line' : r.at === 'field' ? 'Yours, left in the field' : `Yours, at ${ r.atName }` ) : '';
		return `<div class="df-row"><div><b>${ esc( W.name ) }</b> <small>${ esc( W.sub ) }</small><small>${ esc( stats ) }</small><small>Crew: ${ esc( crew ) }${ where ? ' · ' + esc( where ) : '' }</small></div><div class="df-acts">${ acts.join( '' ) }</div></div>`;

	}

	_seats() {

		const s = this.df.seatView( this.seatTarget );
		if ( ! s ) return `<div class="hb-head"><h2>Seats</h2><button class="df-btn" data-act="close">Close</button></div><p class="df-sub">That aircraft has gone.</p>`;
		const rows = s.seats.map( ( x, i ) => `<div class="df-row"><div><b>${ i + 1 } · ${ esc( ROLE_NAMES[ x.role ] ) }</b><small>${ esc( x.note ) }</small></div><div class="df-acts">${ x.mine ? '<span class="df-sub">You</span>' : x.who ? `<span class="df-sub">${ esc( x.who ) }</span>` : `<button class="df-btn is-main" data-act="seat" data-v="${ i }">Take</button>` }</div></div>` ).join( '' );
		return `<div class="hb-head"><div><h2>${ esc( s.title ) }</h2><p class="df-sub">${ esc( s.sub ) }</p></div><button class="df-btn" data-act="close">Close</button></div><div class="df-list">${ rows }</div>${ this._msg() }`;

	}

	onClick( act, el ) {

		const v = el && el.dataset ? el.dataset.v : null;
		if ( act === 'tab' ) {

			this.tab = v;
			this.msg = null;
			return;

		}

		if ( act === 'seat' ) {

			const r = this.df.takeSeat( this.seatTarget, + v );
			this.say( r );
			if ( r && r.ok ) this.close();
			return;

		}

		const r = this.df.act( act, v, this.strip );
		this.say( r );
		if ( r && r.close ) this.close();

	}

}
