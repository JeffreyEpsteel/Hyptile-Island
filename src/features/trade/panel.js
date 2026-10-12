import { GOODS, GOOD_IDS, PORTS } from './goods.js';

// The trade window: a glass panel in the look of the game's HUD panels (gm-panel: the --tw-* tokens of
// ui/ui.css, .tw-glass), opened at a market stall with E. Tabs: Market (every good with the stall's buy and sell
// price, a two-day sparkline, the other port's last known price with the margin, what the hold carries, and
// buy / sell buttons for 1, 5 and max / all, and a row of ports to compare with), Contracts (hauling offers, the
// licence, consignments aboard), Credit (merchant standing, the lender, loans), Costs (bait, wages, upkeep), Ledger
// (profit, trips, best trade, routes) and News (market events, rival voyages, the smuggler's rumour). Opened at the
// smuggler's spot the same window shows his Contraband tab instead. The hold bar and the projected profit of the
// cargo stay below every tab.
//
// The DOM is built lazily, the first time the window opens with a HUD to put it in (app.ui.ui.hud), and the market
// rows are built once and updated in place so a click never lands on a button that was just replaced.
// Everything it shows comes from trade.view( port ); the buttons call trade.buy / trade.sell.

const CSS = /* css */`
.tr-panel { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -48%); width: min(calc(720 * var(--tw-u)), calc(100vw - 2 * var(--tw-edge))); max-height: 84vh;
	display: flex; flex-direction: column; padding: var(--tw-4) var(--tw-5); border-radius: var(--tw-r-lg); font: 500 var(--tw-fs-md) var(--tw-font); color: var(--tw-ink);
	opacity: 0; pointer-events: none; transition: opacity var(--tw-med) var(--tw-ease), transform var(--tw-slow) var(--tw-ease); z-index: 6; }
.tr-panel.is-open { opacity: 1; pointer-events: auto; transform: translate(-50%, -50%); }
.tw-root.is-photo .tr-panel { display: none; }
.tr-head { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--tw-3); }
.tr-head h2 { margin: 0 0 var(--tw-1); font-size: calc(17 * var(--tw-u)); font-weight: 600; }
.tr-sub { margin: 0; color: var(--tw-ink-3); font-size: var(--tw-fs-sm); }
.tr-sub b { color: var(--tw-sun); font-family: var(--tw-mono); font-weight: 600; }
.tr-btn { font: 600 var(--tw-fs-md) var(--tw-font); color: var(--tw-ink); background: var(--tw-fill-2); border: 0; border-radius: 999px; padding: var(--tw-2) var(--tw-4); cursor: pointer; white-space: nowrap; }
.tr-btn:hover { background: var(--tw-line-2); }
.tr-tabs { display: flex; gap: var(--tw-1); margin: var(--tw-3) 0; padding: 3px; border-radius: 999px; background: var(--tw-fill); }
.tr-tab { flex: 1; font: 600 var(--tw-fs-sm) var(--tw-font); color: var(--tw-ink-2); background: none; border: 0; border-radius: 999px; padding: calc(5 * var(--tw-u)) var(--tw-3); cursor: pointer; transition: background var(--tw-fast), color var(--tw-fast); }
.tr-tab:hover { color: var(--tw-ink); }
.tr-tab.is-on { background: var(--tw-fill-2); color: var(--tw-ink); box-shadow: inset 0 0 0 1px var(--tw-line-2); }
.tr-body { overflow: auto; min-height: 0; margin: 0 calc(-1 * var(--tw-2)); padding: 0 var(--tw-2); }
.tr-cols, .tr-row { display: grid; grid-template-columns: minmax(0, 1.3fr) calc(60 * var(--tw-u)) calc(50 * var(--tw-u)) calc(50 * var(--tw-u)) minmax(0, 1.25fr) calc(62 * var(--tw-u)) auto; gap: var(--tw-2); align-items: center; }
.tr-cols { padding: 0 0 var(--tw-1); color: var(--tw-ink-3); font-size: var(--tw-fs-xs); letter-spacing: 0.08em; text-transform: uppercase; border-bottom: 1px solid var(--tw-line); }
.tr-cols span:nth-child(n+3) { text-align: right; }
.tr-cols span:nth-child(2) { text-align: center; }
.tr-row { padding: calc(6 * var(--tw-u)) 0; border-bottom: 1px solid var(--tw-line); }
.tr-row.is-event { background: linear-gradient(90deg, rgba(var(--tw-sun-rgb), 0.07), transparent 70%); }
.tr-name { display: flex; align-items: center; gap: var(--tw-2); min-width: 0; }
.tr-name > div { min-width: 0; }
.tr-name b { display: block; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tr-name small { display: block; color: var(--tw-ink-3); font-size: var(--tw-fs-xs); line-height: 1.3; }
.tr-name em { font-style: normal; font-weight: 600; color: var(--tw-sun); }
.tr-sw { flex: none; width: calc(10 * var(--tw-u)); height: calc(26 * var(--tw-u)); border-radius: 3px; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.35); }
.tr-spark { width: 100%; height: calc(22 * var(--tw-u)); overflow: visible; }
.tr-spark polyline { fill: none; stroke: var(--tw-aqua); stroke-width: 1.5; stroke-linejoin: round; stroke-linecap: round; vector-effect: non-scaling-stroke; }
.tr-spark line { stroke: var(--tw-ink-4); stroke-width: 1; stroke-dasharray: 2 3; vector-effect: non-scaling-stroke; }
.tr-spark circle { fill: var(--tw-sun); }
.tr-num { text-align: right; min-width: 0; }
.tr-num b { display: block; font: 600 var(--tw-fs-md) var(--tw-mono); color: var(--tw-ink); white-space: nowrap; }
.tr-num small { display: block; color: var(--tw-ink-3); font-size: var(--tw-fs-xs); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tr-num small.is-cheap { color: var(--tw-aqua); }
.tr-num small.is-dear { color: var(--tw-sun); }
.tr-num small.is-up { color: var(--tw-aqua); }
.tr-num small.is-down { color: var(--tw-coral); }
.tr-num.is-stale b { color: var(--tw-ink-3); }
.tr-act { display: flex; gap: var(--tw-2); justify-content: flex-end; }
.tr-grp { display: inline-flex; gap: 2px; }
.tr-grp button { font: 600 var(--tw-fs-sm) var(--tw-font); color: var(--tw-ink); background: var(--tw-fill); border: 1px solid var(--tw-line); padding: 2px calc(7 * var(--tw-u)); cursor: pointer; min-width: calc(26 * var(--tw-u)); }
.tr-grp button:first-child { border-radius: 999px 0 0 999px; }
.tr-grp button:last-child { border-radius: 0 999px 999px 0; }
.tr-grp.is-buy button { color: var(--tw-aqua); }
.tr-grp.is-sell button { color: var(--tw-sun); }
.tr-grp button:hover:not([disabled]) { background: var(--tw-fill-2); }
.tr-grp button[disabled] { opacity: 0.32; cursor: default; }
.tr-tick { color: var(--tw-ink-2); font-size: var(--tw-fs-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tr-tick b { color: var(--tw-sun); font-weight: 600; margin-right: var(--tw-2); font-size: var(--tw-fs-xs); letter-spacing: 0.12em; text-transform: uppercase; }
.tr-news { margin: var(--tw-3) 0 0; padding: 0; list-style: none; color: var(--tw-ink-2); font-size: var(--tw-fs-sm); line-height: 1.5; }
.tr-news li { display: flex; gap: var(--tw-2); padding: 2px 0; }
.tr-news time { flex: none; width: calc(54 * var(--tw-u)); color: var(--tw-ink-3); font-family: var(--tw-mono); font-size: var(--tw-fs-xs); padding-top: 1px; }
.tr-news li.is-active { color: var(--tw-ink); }
.tr-news li.is-active time { color: var(--tw-sun); }
.tr-body h3 { margin: var(--tw-3) 0 var(--tw-1); font-size: var(--tw-fs-xs); font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: var(--tw-ink-3); }
.tr-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--tw-2); margin: var(--tw-1) 0 var(--tw-2); }
.tr-stats div { padding: var(--tw-2) var(--tw-3); border-radius: var(--tw-r-md); background: var(--tw-fill); border: 1px solid var(--tw-line); }
.tr-stats span { display: block; color: var(--tw-ink-3); font-size: var(--tw-fs-xs); letter-spacing: 0.08em; text-transform: uppercase; }
.tr-stats b { font: 600 calc(15 * var(--tw-u)) var(--tw-mono); }
.tr-pos { color: var(--tw-aqua); }
.tr-neg { color: var(--tw-coral); }
.tr-table { width: 100%; border-collapse: collapse; font-size: var(--tw-fs-sm); }
.tr-table th { text-align: right; color: var(--tw-ink-3); font-weight: 600; font-size: var(--tw-fs-xs); letter-spacing: 0.08em; text-transform: uppercase; padding: 2px 0 var(--tw-1); border-bottom: 1px solid var(--tw-line); }
.tr-table td { text-align: right; font-family: var(--tw-mono); padding: calc(5 * var(--tw-u)) 0; border-bottom: 1px solid var(--tw-line); }
.tr-table th:first-child, .tr-table td:first-child { text-align: left; font-family: var(--tw-font); }
.tr-empty { color: var(--tw-ink-3); padding: var(--tw-3) 0; font-size: var(--tw-fs-sm); }
.tr-foot { margin-top: var(--tw-3); padding-top: var(--tw-3); border-top: 1px solid var(--tw-line); display: grid; gap: var(--tw-1); }
.tr-cap { display: flex; align-items: center; gap: var(--tw-3); color: var(--tw-ink-2); }
.tr-capbar { flex: 1; max-width: calc(220 * var(--tw-u)); height: calc(6 * var(--tw-u)); border-radius: 99px; background: var(--tw-fill-2); overflow: hidden; }
.tr-capbar > span { display: block; height: 100%; width: 0; background: var(--tw-aqua); border-radius: inherit; transition: width var(--tw-med) var(--tw-ease); }
.tr-capbar.is-full > span { background: var(--tw-coral); }
.tr-cap b { font-family: var(--tw-mono); font-weight: 600; color: var(--tw-ink); }
.tr-cap small { color: var(--tw-ink-3); }
.tr-proj { color: var(--tw-ink-2); font-size: var(--tw-fs-sm); min-height: 1.4em; }
.tr-warn { color: var(--tw-sun); font-size: var(--tw-fs-sm); }
.tr-msg { color: var(--tw-ink-3); font-size: var(--tw-fs-sm); min-height: 1.4em; }
.tr-msg.is-bad { color: var(--tw-coral); }
.tr-num small.is-contraband, .tr-bad { color: var(--tw-coral); }
.tr-cmp { display: flex; flex-wrap: wrap; gap: var(--tw-1); align-items: center; margin: 0 0 var(--tw-2); color: var(--tw-ink-3); font-size: var(--tw-fs-xs); letter-spacing: 0.08em; text-transform: uppercase; }
.tr-cmp button { font: 600 var(--tw-fs-sm) var(--tw-font); letter-spacing: 0; text-transform: none; color: var(--tw-ink-2); background: var(--tw-fill); border: 1px solid var(--tw-line); border-radius: 999px; padding: 1px calc(9 * var(--tw-u)); cursor: pointer; }
.tr-cmp button.is-on { color: var(--tw-ink); background: var(--tw-fill-2); border-color: var(--tw-line-2); }
.tr-card { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--tw-2) var(--tw-3); align-items: center; padding: calc(7 * var(--tw-u)) 0; border-bottom: 1px solid var(--tw-line); }
.tr-card b { font-weight: 600; }
.tr-card small { display: block; color: var(--tw-ink-3); font-size: var(--tw-fs-xs); line-height: 1.4; }
.tr-card .tr-act { gap: var(--tw-1); flex-wrap: wrap; }
.tr-act .tr-btn { padding: 2px var(--tw-3); font-size: var(--tw-fs-sm); }
.tr-act .tr-btn[disabled] { opacity: 0.35; cursor: default; }
@media (max-width: 760px) {
	.tr-cols, .tr-row { grid-template-columns: minmax(0, 1.4fr) calc(46 * var(--tw-u)) calc(46 * var(--tw-u)) minmax(0, 1fr) calc(34 * var(--tw-u)) auto; }
	.tr-spark, .tr-cols span:nth-child(2) { display: none; }
}
`;

const TABS = [ [ 'market', 'Market' ], [ 'contracts', 'Contracts' ], [ 'credit', 'Credit' ], [ 'costs', 'Costs' ], [ 'ledger', 'Ledger' ], [ 'news', 'News' ] ];
const DEN_TABS = [ [ 'den', 'Contraband' ], [ 'news', 'Word' ] ];
const portName = ( id ) => ( PORTS[ id ] ? PORTS[ id ].name : id );
let cssInstalled = false;

const group = ( n ) => String( Math.round( Math.abs( n ) ) ).replace( /\B(?=(\d{3})+(?!\d))/g, ',' );
const money = ( n ) => ( n < 0 ? '-$' : '$' ) + group( n );
const signed = ( n ) => ( n < 0 ? '-$' : '+$' ) + group( n );
const price = ( p ) => ( p < 20 ? '$' + p.toFixed( 1 ) : '$' + group( p ) );
const hours = ( h ) => ( h < 1 ? 'just now' : h < 48 ? `${ Math.round( h ) } h ago` : `${ Math.round( h / 24 ) } d ago` );
const left = ( h ) => ( h <= 0 ? 'due now' : h < 48 ? `${ Math.max( 1, Math.round( h ) ) } h left` : `${ Math.round( h / 24 ) } d left` );
const clock = ( h ) => {

	const m = Math.floor( ( h % 1 ) * 60 );
	return `${ String( Math.floor( h ) ).padStart( 2, '0' ) }:${ String( m ).padStart( 2, '0' ) }`;

};

const esc = ( s ) => String( s ).replace( /[&<>"]/g, ( c ) => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } )[ c ] );

export class TradePanel {

	constructor( trade ) {

		this.trade = trade;
		this.el = null;
		this.port = null;
		this.kind = 'market';
		this.tab = 'market';
		this.loanDays = 3;
		this.isOpen = false;
		this.msg = null; // { text, bad, at }
		this._rows = {};
		this._cache = '';
		this._keys = ( e ) => {

			if ( e.code === 'Escape' && this.isOpen ) this.trade.close();

		};

	}

	_ensure() {

		if ( this.el ) return true;
		if ( typeof document === 'undefined' ) return false;
		const app = this.trade.app;
		const ui = app && app.ui && app.ui.ui;
		const host = ui ? ui.hud || ui.root : null;
		if ( ! host ) return false;
		if ( ! cssInstalled ) {

			const style = document.createElement( 'style' );
			style.textContent = CSS;
			document.head.append( style );
			cssInstalled = true;

		}

		this.el = document.createElement( 'div' );
		this.el.className = 'tr-panel tw-glass tw-interactive';
		this.el.addEventListener( 'click', ( e ) => this._click( e ) );
		host.append( this.el );
		return true;

	}

	open( port, kind = 'market' ) {

		if ( ! this._ensure() ) return false;
		this.port = port;
		if ( kind !== this.kind ) this.tab = kind === 'smuggler' ? 'den' : 'market';
		this.kind = kind;
		this.isOpen = true;
		this.msg = null;
		this.build();
		this.refresh();
		this.el.classList.add( 'is-open' );
		try {

			if ( document.pointerLockElement && document.exitPointerLock ) document.exitPointerLock();

		} catch ( e ) { /* ignore */ }

		document.addEventListener( 'keydown', this._keys, true );
		return true;

	}

	close() {

		if ( ! this.isOpen ) return;
		this.isOpen = false;
		if ( this.el ) this.el.classList.remove( 'is-open' );
		if ( typeof document !== 'undefined' ) document.removeEventListener( 'keydown', this._keys, true );

	}

	dispose() {

		this.close();
		if ( this.el && this.el.remove ) this.el.remove();
		this.el = null;

	}

	// ---- structure

	build() {

		const el = this.el;
		el.innerHTML = `
			<div class="tr-head"><div><h2 data-f="title"></h2><p class="tr-sub" data-f="sub"></p></div><button class="tr-btn" data-act="close">Close (E)</button></div>
			<div class="tr-tabs">${ ( this.kind === 'smuggler' ? DEN_TABS : TABS ).map( ( [ id, name ] ) => `<button class="tr-tab${ id === this.tab ? ' is-on' : '' }" data-act="tab" data-tab="${ id }">${ name }</button>` ).join( '' ) }</div>
			<div class="tr-body" data-f="body"></div>
			<div class="tr-foot">
				<div class="tr-cap"><span>Hold</span><span class="tr-capbar" data-f="capbar"><span></span></span><b data-f="cap"></b><small data-f="kg"></small></div>
				<div class="tr-proj" data-f="proj"></div>
				<div class="tr-warn" data-f="warn"></div>
				<div class="tr-msg" data-f="msg"></div>
				<div class="tr-tick" data-f="tick"></div>
			</div>`;
		this._f = {};
		for ( const n of el.querySelectorAll( '[data-f]' ) ) this._f[ n.dataset.f ] = n;
		this._rows = {};
		this._cache = '';
		if ( this.tab === 'market' ) this.buildMarket();

	}

	buildMarket() {

		const body = this._f.body;
		body.innerHTML = `
			<div class="tr-cmp" data-f="cmp"></div>
			<div class="tr-cols"><span>Goods</span><span>2 days</span><span>Buy</span><span>Sell</span><span data-f="othername">Other port</span><span>Hold</span><span style="text-align:right">Buy / sell</span></div>
			${ GOOD_IDS.map( ( g ) => `
			<div class="tr-row" data-good="${ g }">
				<div class="tr-name"><i class="tr-sw" style="background:${ GOODS[ g ].color }"></i><div><b>${ GOODS[ g ].name }</b><small data-f="meta"></small></div></div>
				<svg class="tr-spark" viewBox="0 0 64 22" preserveAspectRatio="none"><line data-f="eq" x1="0" x2="64" y1="11" y2="11"></line><polyline data-f="line" points=""></polyline><circle data-f="dot" r="2.2" cx="64" cy="11"></circle></svg>
				<div class="tr-num"><b data-f="buy"></b><small data-f="tag"></small></div>
				<div class="tr-num"><b data-f="sell"></b><small data-f="cond"></small></div>
				<div class="tr-num" data-f="otherbox"><b data-f="other"></b><small data-f="note"></small><small data-f="age"></small></div>
				<div class="tr-num"><b data-f="held"></b><small data-f="heldv"></small></div>
				<div class="tr-act">
					<span class="tr-grp is-buy"><button data-act="buy" data-n="1" title="Buy one">+1</button><button data-act="buy" data-n="5" title="Buy five">+5</button><button data-act="buy" data-n="max" title="Buy as many as fit and you can pay for">Max</button></span>
					<span class="tr-grp is-sell"><button data-act="sell" data-n="1" title="Sell one">-1</button><button data-act="sell" data-n="5" title="Sell five">-5</button><button data-act="sell" data-n="all" title="Sell all of it">All</button></span>
				</div>
			</div>` ).join( '' ) }`;
		for ( const row of body.querySelectorAll( '.tr-row' ) ) {

			const f = {};
			for ( const n of row.querySelectorAll( '[data-f]' ) ) f[ n.dataset.f ] = n;
			f.el = row;
			f.buttons = [ ...row.querySelectorAll( 'button' ) ];
			this._rows[ row.dataset.good ] = f;

		}

		this._f.othername = body.querySelector( '[data-f="othername"]' );
		this._f.cmp = body.querySelector( '[data-f="cmp"]' );
		this._cmpKey = '';

	}

	// ---- values

	refresh() {

		if ( ! this.isOpen || ! this.el ) return;
		const t = this.trade;
		const v = t.view( this.port );
		const F = this._f;
		F.title.textContent = this.kind === 'smuggler' ? `${ t.smuggler.view( this.port ).name }, ${ v.name }` : v.title;
		F.sub.innerHTML = `Day ${ v.day } · ${ clock( v.hour ) } · Purse <b>${ v.sandbox ? 'free play' : money( v.money ) }</b> · Standing <b>${ Math.floor( v.standing ) }</b>${ v.sandbox ? ' · sandbox: purchases are free' : '' }`;
		F.cap.textContent = `${ v.used } / ${ v.capacity } crates`;
		F.kg.textContent = `${ Math.round( v.kg ) } kg${ v.boat ? '' : ' · on foot' }`;
		F.capbar.firstElementChild.style.width = `${ Math.min( 100, v.capacity ? v.used / v.capacity * 100 : 100 ) }%`;
		F.capbar.classList.toggle( 'is-full', v.used >= v.capacity );
		const p = v.projected;
		if ( p.has ) F.proj.innerHTML = `Cargo sold at ${ p.name } at the prices last seen: <b class="${ p.profit >= 0 ? 'tr-pos' : 'tr-neg' }">${ signed( p.profit ) }</b> (worth ${ money( p.value ) }, cost ${ money( p.cost ) }), voyage about ${ Math.max( 1, Math.round( v.voyage ) ) } h`;
		else if ( v.tip ) F.proj.innerHTML = `Hold empty. Best load here: <b class="tr-pos">${ esc( v.tip.name ) } x${ v.tip.room }</b>, about ${ signed( v.tip.gain ) } if sold at ${ v.otherName } at the prices last seen.`;
		else F.proj.textContent = 'Hold empty. Nothing here beats the prices at ' + v.otherName + ' right now.';
		F.warn.textContent = v.warnings.join(' · ');
		if ( this.msg && performance.now() - this.msg.at > 6000 ) this.msg = null;
		F.msg.textContent = this.msg ? this.msg.text : v.sandbox ? 'Sandbox: buying costs nothing, selling still pays.' : '';
		F.msg.classList.toggle( 'is-bad', !! ( this.msg && this.msg.bad ) );
		const n = v.news.find( ( x ) => x.active ) || v.news[ 0 ];
		F.tick.innerHTML = n ? `<b>${ n.active ? 'News' : 'Earlier' }</b>${ esc( n.text ) } (${ hours( n.age ) })` : '';
		if ( this.tab === 'market' ) this.refreshMarket( v );
		else this.refreshText( v );

	}

	refreshMarket( v ) {

		this._f.othername.textContent = v.otherName + ' (last seen)';
		const key = v.other + '|' + v.ports.map( ( p ) => p.id ).join();
		if ( key !== this._cmpKey ) {

			this._cmpKey = key;
			this._f.cmp.innerHTML = `<span>Compare with</span>${ v.ports.map( ( p ) => `<button data-act="cmp" data-port="${ p.id }" class="${ p.id === v.other ? 'is-on' : '' }" title="${ p.seen ? 'Prices you saw there' : 'Only rumours so far' }">${ esc( p.name ) }${ p.seen ? '' : ' ~' }</button>` ).join( '' ) }`;

		}

		for ( const r of v.rows ) {

			const f = this._rows[ r.id ];
			if ( ! f ) continue;
			f.meta.innerHTML = `${ r.unit } · ${ r.crates } crate${ r.crates > 1 ? 's' : '' }${ r.perish >= 0.01 ? ` · melts ${ ( r.perish * 100 ).toFixed( 0 ) }%/h` : '' }${ r.event ? ` · <em>${ r.event.pct >= 0 ? '+' : '' }${ r.event.pct }%</em>` : '' }`;
			f.el.classList.toggle( 'is-event', !! r.event );
			f.buy.textContent = price( r.buy );
			f.tag.textContent = r.tag;
			f.tag.title = r.tag === 'cheap' ? 'Cheap here: a good place to buy' : r.tag === 'dear' ? 'Dear here: a good place to sell' : r.tag === 'contraband' ? 'Contraband here: only the smuggler deals in it, and customs seize it' : '';
			f.tag.className = r.tag ? `is-${ r.tag }` : '';
			f.sell.textContent = price( r.sell * ( r.held ? r.cond : 1 ) );
			f.cond.textContent = r.held && r.cond < 0.995 ? `${ Math.round( r.cond * 100 ) }% condition` : '';
			f.other.textContent = `${ r.other.rumour ? '~' : '' }${ price( r.other.sell ) }`;
			f.otherbox.classList.toggle( 'is-stale', r.other.stale || r.other.rumour );
			const m = r.margin;
			f.note.textContent = r.other.contraband ? 'contraband there' : `${ signed( m ) }/unit${ r.room > 0 ? ' · up to ' + r.room : '' }`;
			f.age.textContent = r.other.rumour ? 'rumour' : r.other.age < 1 ? 'seen just now' : `seen ${ hours( r.other.age ) }`;
			f.note.className = r.other.contraband ? 'is-contraband' : m > 0.5 ? 'is-up' : m < - 0.5 ? 'is-down' : '';
			f.held.textContent = r.held ? String( r.held ) : '-';
			f.heldv.textContent = r.held ? `paid ${ money( r.paid ) }` : '';
			this.spark( f, r );
			f.buttons.forEach( ( b ) => { b.disabled = b.dataset.act === 'buy' ? ! r.can.buy : ! r.can.sell; } );

		}

	}

	// the 2-day price line, scaled to its own range, with the equilibrium as a dashed rule
	spark( f, r ) {

		const h = r.hist;
		let lo = Math.min( ...h, r.mid ), hi = Math.max( ...h, r.mid );
		const pad = Math.max( ( hi - lo ) * 0.15, r.mid * 0.03 );
		lo -= pad;
		hi += pad;
		const y = ( p ) => ( 20.5 - ( p - lo ) / ( hi - lo ) * 19 ).toFixed( 1 );
		const n = h.length;
		f.line.setAttribute( 'points', h.map( ( p, i ) => `${ ( n > 1 ? i / ( n - 1 ) * 63 : 63 ).toFixed( 1 ) },${ y( p ) }` ).join( ' ' ) );
		f.dot.setAttribute( 'cx', '63' );
		f.dot.setAttribute( 'cy', y( h[ n - 1 ] ) );
		f.eq.setAttribute( 'y1', y( r.eq ) );
		f.eq.setAttribute( 'y2', y( r.eq ) );

	}

	refreshText( v ) {

		const t = this.trade;
		const html = this.tab === 'ledger' ? this.ledgerHtml( v )
			: this.tab === 'contracts' ? this.contractsHtml( t.haul.view( this.port ) )
				: this.tab === 'credit' ? this.creditHtml( t.credit.view( this.port ) )
					: this.tab === 'costs' ? this.costsHtml( t.operating.view() )
						: this.tab === 'den' ? this.denHtml( t.smuggler.view( this.port ) )
							: this.newsHtml( v );
		if ( html === this._cache ) return;
		this._cache = html;
		this._f.body.innerHTML = html;

	}

	ledgerHtml( v ) {

		const L = v.ledger;
		const best = L.best;
		const routes = L.routeList;
		const goods = Object.keys( L.goods ).map( ( g ) => ( { g, ...L.goods[ g ] } ) ).sort( ( a, b ) => b.profit - a.profit );
		return `
			<div class="tr-stats">
				<div><span>Net profit</span><b class="${ L.profit >= 0 ? 'tr-pos' : 'tr-neg' }">${ signed( L.profit ) }</b></div>
				<div><span>Trips</span><b>${ L.trips }</b></div>
				<div><span>Spent</span><b>${ money( L.spent ) }</b></div>
				<div><span>Sales</span><b>${ money( L.revenue ) }</b></div>
			</div>
			<h3>Best trade</h3>
			${ best ? `<div>${ esc( GOODS[ best.good ].name ) } x${ best.qty }, ${ best.from === best.to ? 'flipped at ' + esc( portName( best.to ) ) : `${ esc( portName( best.from ) ) } to ${ esc( portName( best.to ) ) }` }: <b class="${ best.profit >= 0 ? 'tr-pos' : 'tr-neg' }">${ signed( best.profit ) }</b> (day ${ best.day })</div>` : '<div class="tr-empty">No sales yet. Buy where it is cheap, sell where it is dear.</div>' }
			<h3>Routes</h3>
			${ routes.length ? `<table class="tr-table"><tr><th>Route</th><th>Sales</th><th>Units</th><th>Sold for</th><th>Profit</th></tr>${ routes.map( ( r ) => `<tr><td>${ esc( r.label ) }</td><td>${ r.sales }</td><td>${ r.units }</td><td>${ money( r.revenue ) }</td><td class="${ r.profit >= 0 ? 'tr-pos' : 'tr-neg' }">${ signed( r.profit ) }</td></tr>` ).join( '' ) }</table>` : '<div class="tr-empty">No routes sailed yet.</div>' }
			<h3>By goods</h3>
			${ goods.length ? `<table class="tr-table"><tr><th>Goods</th><th>Units</th><th>Sold for</th><th>Profit</th></tr>${ goods.map( ( x ) => `<tr><td>${ esc( GOODS[ x.g ].name ) }</td><td>${ x.units }</td><td>${ money( x.revenue ) }</td><td class="${ x.profit >= 0 ? 'tr-pos' : 'tr-neg' }">${ signed( x.profit ) }</td></tr>` ).join( '' ) }</table>` : '<div class="tr-empty">Nothing sold yet.</div>' }`;

	}

	newsHtml( v ) {

		const live = v.events.map( ( e ) => `<li class="is-active"><time>${ Math.round( e.left ) } h left</time><span>${ esc( e.text ) }</span></li>` ).join( '' );
		const old = v.news.filter( ( n ) => ! n.active ).map( ( n ) => `<li><time>${ hours( n.age ) }</time><span>${ esc( n.text ) }</span></li>` ).join( '' );
		return `${ v.rumour ? `<h3>Rumour</h3><ul class="tr-news"><li><span>${ esc( v.rumour ) }</span></li></ul>` : '' }<h3>Happening now</h3><ul class="tr-news">${ live || '<li><span>The markets are quiet.</span></li>' }</ul><h3>Earlier</h3><ul class="tr-news">${ old || '<li><span>Nothing earlier.</span></li>' }</ul>`;

	}

	contractsHtml( h ) {

		const lic = h.next
			? `<div class="tr-card"><div><b>${ esc( h.licence.name ) }</b><small>Next: ${ esc( h.next.name ) }, loads up to ${ h.next.maxCrates } crates${ h.next.standing ? `, needs standing ${ h.next.standing }` : '' }</small></div><div class="tr-act"><button class="tr-btn" data-act="licence">${ h.next.price ? money( h.next.price ) : 'Free' }</button></div></div>`
			: `<div class="tr-card"><div><b>${ esc( h.licence.name ) }</b><small>Any load you can carry</small></div></div>`;
		const act = h.active.map( ( c ) => `<div class="tr-card"><div><b>${ c.qty } ${ esc( c.name.toLowerCase() ) } to ${ esc( c.toName ) }</b><small>${ c.crates } crate${ c.crates > 1 ? 's' : '' } aboard · ${ money( c.reward ) } on delivery${ c.paidDeposit ? ` + ${ money( c.paidDeposit ) } deposit back` : '' } · <span class="${ c.left < 3 ? 'tr-bad' : '' }">${ left( c.left ) }</span>${ c.here ? ' · delivered when you open this stall' : '' }</small></div><div class="tr-act"><button class="tr-btn" data-act="abandon" data-id="${ c.id }" title="The deposit is forfeit">Abandon</button></div></div>` ).join( '' );
		const offers = h.offers.map( ( o ) => `<div class="tr-card"><div><b>${ o.qty } ${ esc( o.name.toLowerCase() ) } to ${ esc( o.toName ) }</b><small>${ o.crates } crate${ o.crates > 1 ? 's' : '' } · pays ${ money( o.reward ) } · deposit ${ money( o.deposit ) } · ${ o.hours } h${ o.why ? ` · <span class="tr-bad">${ esc( o.why ) }</span>` : '' }</small></div><div class="tr-act"><button class="tr-btn" data-act="accept" data-id="${ o.id }" ${ o.ok ? '' : 'disabled' }>Take it</button></div></div>` ).join( '' );
		return `<h3>Licence</h3>${ lic }<h3>Aboard</h3>${ act || '<div class="tr-empty">No consignments aboard.</div>' }<h3>On the board here</h3>${ offers || '<div class="tr-empty">Nothing posted. Come back later.</div>' }<div class="tr-empty">Delivered ${ h.done } · failed ${ h.failed }</div>`;

	}

	creditHtml( c ) {

		if ( c.sandbox ) return `<div class="tr-stats"><div><span>Standing</span><b>${ Math.floor( c.standing ) }</b></div></div><div class="tr-empty">Sandbox: nobody needs a loan.</div>`;
		const amounts = [ 100, 250, 500, 1000, 2500 ].filter( ( a ) => a <= c.limit );
		const days = c.days.map( ( d ) => `<button class="tr-btn${ d === this.loanDays ? ' is-on' : '' }" data-act="days" data-days="${ d }">${ d } d</button>` ).join( '' );
		const loans = c.loans.map( ( l ) => `<div class="tr-card"><div><b>${ money( Math.ceil( l.owed ) ) } at ${ esc( l.name ) }</b><small>${ l.why === 'loan' ? `borrowed ${ money( l.principal ) }` : esc( l.why ) } · ${ ( l.rate * 100 ).toFixed( 1 ) }% a day · <span class="${ l.status !== 'open' ? 'tr-bad' : '' }">${ l.status === 'open' ? left( l.left ) : l.status }</span></small></div>${ l.port === c.port ? `<div class="tr-act"><button class="tr-btn" data-act="repay">Repay</button></div>` : '' }</div>` ).join( '' );
		return `
			<div class="tr-stats">
				<div><span>Standing</span><b>${ Math.floor( c.standing ) }</b></div>
				<div><span>Credit here</span><b>${ money( c.limit ) }</b></div>
				<div><span>Interest</span><b>${ ( c.rate * 100 ).toFixed( 1 ) }%/d</b></div>
				<div><span>Owed</span><b class="${ c.owed > 0 ? 'tr-neg' : '' }">${ money( Math.ceil( c.owed ) ) }</b></div>
			</div>
			<h3>Borrow here</h3>
			${ c.blocked ? '<div class="tr-empty tr-bad">You defaulted here. Pay it first.</div>' : amounts.length ? `<div class="tr-card"><div>Term <span class="tr-act" style="display:inline-flex">${ days }</span><small>Repaid here, with interest; late loans cost double and your standing</small></div><div class="tr-act">${ amounts.map( ( a ) => `<button class="tr-btn" data-act="loan" data-amount="${ a }">${ money( a ) }</button>` ).join( '' ) }</div></div>` : '<div class="tr-empty">The lender will not advance you more here.</div>' }
			<h3>Your loans</h3>${ loans || '<div class="tr-empty">No debts.</div>' }
			<div class="tr-empty">Standing rises with profitable voyages, delivered contracts and loans repaid on time; it narrows the stalls' spread, lowers interest and calms customs.</div>`;

	}

	costsHtml( o ) {

		if ( o.sandbox ) return `<div class="tr-empty">Sandbox: bait, wages and upkeep cost nothing.</div>`;
		return `
			<div class="tr-stats">
				<div><span>Bait</span><b class="${ o.bait < 5 ? 'tr-neg' : '' }">${ o.bait }</b></div>
				<div><span>Wages / day</span><b>${ money( o.wages ) }</b></div>
				<div><span>Upkeep / day</span><b>${ money( o.upkeep ) }</b></div>
				<div><span>Owed</span><b class="${ o.owed > 0 ? 'tr-neg' : '' }">${ money( Math.ceil( o.owed ) ) }</b></div>
			</div>
			<div class="tr-card"><div><b>Bait</b><small>One per cast; a bare hook bites slowly. ${ o.tin } for ${ money( o.tinPrice ) }</small></div><div class="tr-act"><button class="tr-btn" data-act="bait" data-n="${ o.tin }">+${ o.tin }</button><button class="tr-btn" data-act="bait" data-n="${ o.tin * 5 }">+${ o.tin * 5 }</button></div></div>
			<div class="tr-card"><div><b>Crew of ${ o.crew }</b><small>${ o.deserted ? '<span class="tr-bad">The crew walked off: the ship sails short-handed</span>' : o.missedDays ? `<span class="tr-bad">${ o.missedDays } day${ o.missedDays > 1 ? 's' : '' } unpaid</span>` : 'Paid at the turn of each day' } · next bill in ${ Math.ceil( o.nextBillIn ) } h</small></div>${ o.owed > 0 ? `<div class="tr-act"><button class="tr-btn" data-act="payowed">Pay ${ money( Math.ceil( o.owed ) ) }</button></div>` : '' }</div>
			<div class="tr-empty">Spent so far: bait ${ money( o.spent.bait ) } · wages ${ money( o.spent.wages ) } · upkeep ${ money( o.spent.upkeep ) }</div>`;

	}

	denHtml( d ) {

		if ( ! d.here ) return '<div class="tr-empty">Nobody here. He only comes after dark.</div>';
		const rows = d.rows.map( ( r ) => `<div class="tr-card"><div><b><i class="tr-sw" style="background:${ r.color };display:inline-block;height:1em;vertical-align:middle"></i> ${ esc( r.name ) }</b><small>He pays ${ price( r.bid ) } a ${ esc( r.unit ) } · you carry ${ r.held }${ r.held && r.cond < 0.995 ? ` at ${ Math.round( r.cond * 100 ) }%` : '' }</small></div><div class="tr-act"><button class="tr-btn" data-act="ssell" data-good="${ r.good }" data-n="1" ${ r.held ? '' : 'disabled' }>Sell 1</button><button class="tr-btn" data-act="ssell" data-good="${ r.good }" data-n="all" ${ r.held ? '' : 'disabled' }>Sell all</button></div></div>` ).join( '' );
		const comp = d.nextCompartment ? `<div class="tr-card"><div><b>Hidden compartment</b><small>Now hides ${ d.compartment.hides } crates; next hides ${ d.nextCompartment.hides }${ d.nextCompartment.trust ? `, wants trust ${ d.nextCompartment.trust }` : '' }</small></div><div class="tr-act"><button class="tr-btn" data-act="compartment">${ money( d.nextCompartment.price ) }</button></div></div>` : `<div class="tr-card"><div><b>Hidden compartment</b><small>Hides ${ d.compartment.hides } crates</small></div></div>`;
		return `
			<div class="tr-stats"><div><span>Trust</span><b>${ d.trust }</b></div><div><span>Papers</span><b>${ d.papers } / ${ d.papersMax }</b></div><div><span>Hides</span><b>${ d.compartment.hides } crates</b></div><div><span>Port</span><b>${ esc( d.portName ) }</b></div></div>
			<h3>He buys tonight</h3>${ rows || '<div class="tr-empty">Nothing he wants here.</div>' }
			<h3>Services</h3>${ comp }
			<div class="tr-card"><div><b>Forged papers</b><small>Wave you through one customs inspection</small></div><div class="tr-act"><button class="tr-btn" data-act="papers" ${ d.papers >= d.papersMax ? 'disabled' : '' }>${ money( d.papersPrice ) }</button></div></div>`;

	}

	// ---- input

	_click( e ) {

		const b = e.target && e.target.closest ? e.target.closest( '[data-act]' ) : null;
		if ( ! b || b.disabled ) return;
		const act = b.dataset.act;
		if ( act === 'close' ) {

			this.trade.close();
			return;

		}

		if ( act === 'tab' ) {

			this.tab = b.dataset.tab;
			this.build();
			this.refresh();
			return;

		}

		if ( this._service( act, b ) ) {

			this._cache = '';
			this.refresh();
			return;

		}

		const row = b.closest( '[data-good]' );
		if ( ! row || ( act !== 'buy' && act !== 'sell' ) ) return;
		const good = row.dataset.good;
		const n = b.dataset.n === 'max' || b.dataset.n === 'all' ? b.dataset.n : Number( b.dataset.n );
		const r = act === 'buy' ? this.trade.buy( this.port, good, n ) : this.trade.sell( this.port, good, n );
		const name = GOODS[ good ].name.toLowerCase();
		if ( ! r.ok ) this.msg = { text: r.message, bad: true, at: performance.now() };
		else if ( act === 'buy' ) this.msg = { text: `Bought ${ r.qty } ${ name } for ${ money( r.total ) }${ r.limited === 'capacity' ? ' (the hold is full)' : r.limited === 'money' ? ' (all you could pay for)' : '' }.`, bad: false, at: performance.now() };
		else this.msg = { text: `Sold ${ r.qty } ${ name } for ${ money( r.total ) }: ${ r.profit >= 0 ? 'profit' : 'loss' } ${ signed( r.profit ) }.`, bad: false, at: performance.now() };
		this._cache = '';
		this.refresh();

	}

	// the buttons of the Contracts / Credit / Costs / Contraband tabs and the compare row; true when handled
	_service( act, b ) {

		const t = this.trade, port = this.port;
		const say = ( r, good ) => { this.msg = { text: r.ok ? good : r.message, bad: ! r.ok, at: performance.now() }; };
		switch ( act ) {

			case 'cmp': t.setCompare( port, b.dataset.port ); this._cmpKey = ''; return true;
			case 'licence': { const r = t.haul.buyLicence(); say( r, r.ok ? `You hold the ${ r.name }.` : '' ); return true; }
			case 'accept': { const r = t.haul.accept( port, b.dataset.id ); say( r, r.ok ? `Loaded ${ r.contract.qty } ${ GOODS[ r.contract.good ].name.toLowerCase() } for ${ portName( r.contract.to ) }.` : '' ); return true; }
			case 'abandon': t.haul.abandon( b.dataset.id ); this.msg = { text: 'Contract abandoned: the deposit is forfeit.', bad: true, at: performance.now() }; return true;
			case 'days': this.loanDays = Number( b.dataset.days ) || 3; return true;
			case 'loan': { const r = t.credit.take( port, Number( b.dataset.amount ), this.loanDays ); say( r, r.ok ? `Borrowed ${ money( r.loan.principal ) }, due in ${ this.loanDays } days.` : '' ); return true; }
			case 'repay': { const r = t.credit.repay( port, 'all' ); say( r, r.ok ? `Repaid ${ money( r.paid ) }${ r.cleared ? ': clear here.' : '.' }` : '' ); return true; }
			case 'bait': { const r = t.operating.buyBait( Number( b.dataset.n ) ); say( r, r.ok ? `Bought ${ r.qty } bait.` : '' ); return true; }
			case 'payowed': { const r = t.operating.payOwed(); say( r, r.ok ? `Paid ${ money( r.paid ) }.` : '' ); return true; }
			case 'ssell': { const n = b.dataset.n === 'all' ? 'all' : Number( b.dataset.n ); const r = t.smuggler.sell( port, b.dataset.good, n ); say( r, r.ok ? `Sold ${ r.qty } for ${ money( r.total ) }: ${ signed( r.profit ) }.` : '' ); return true; }
			case 'compartment': { const r = t.smuggler.buyCompartment(); say( r, r.ok ? `Your hold now hides ${ r.hides } crates.` : '' ); return true; }
			case 'papers': { const r = t.smuggler.buyPapers(); say( r, r.ok ? `You carry ${ r.papers } set${ r.papers > 1 ? 's' : '' } of papers.` : '' ); return true; }
			default: return false;

		}

	}

}
