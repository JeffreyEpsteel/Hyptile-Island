import { FISH, fishLengthCm } from './FishTable.js';
import { UPGRADES, nextLevel, gearGate, FUEL_PRICE } from './Gear.js';
import { BOATS } from './Boats.js';
import { CHARACTERS, portraitUrl, unlockText } from './Characters.js';
import { TOPICS, linePhrases } from '../audio/Clicks.js';

// The island's vendor panels and the crew roster, installed onto GameHUD.prototype:
//   renderShop()    Ethena: tabs Gear (fuel + upgrades) / Crew (the roster)
//   renderYard()    Captain Roid (vendor kind 'yard'): tabs Yard (the boats (BOATS), bought with game.buyBoat, the
//                   gun and repairs) / Talk (his topics, Clicks.TOPICS: asking one makes him answer in clicks with
//                   subtitles (game.roid.say) and the text lands in the panel's chat log; Goodbye closes the
//                   panel); he clicks (game.roid.clicks) when it opens, on a row, and on a purchase
//   renderStand()   PoorGoat: tabs Sell (the hold) / Quests (game.contracts.active)
//   openRoster() / toggleRoster( force ) / renderRoster()   the roster on its own (K), a lazy gm-panel
//   renderStats()   HTML of the career stats (the inventory footer)
//   refresh()       the original, then the roster when it is open
// Buttons call game.buy / refuel / buyBoat / unlockCharacter / setCharacter / deliverContract /
// sell / sellAll and re-render through state.onChange -> refresh(). In the sandbox (state.free) the yard, the
// gear and the crew say "Free in sandbox": every boat and character is open and nothing is charged.
//
//   import { installHudPanels } from './HudPanels.js';  installHudPanels( GameHUD );

const CSS = /* css */`
.gm-tabs { display: flex; gap: var(--tw-1); margin: 0 0 var(--tw-3); padding: 3px; border-radius: 999px; background: var(--tw-fill); }
.gm-tab { flex: 1; font: 600 var(--tw-fs-sm) var(--tw-font); color: var(--tw-ink-2); background: none; border: 0; border-radius: 999px; padding: calc(5 * var(--tw-u)) var(--tw-3); cursor: pointer;
	transition: background var(--tw-fast), color var(--tw-fast); }
.gm-tab:hover { color: var(--tw-ink); }
.gm-tab.is-on { background: var(--tw-fill-2); color: var(--tw-ink); box-shadow: inset 0 0 0 1px var(--tw-line-2); }
.gm-tab .gm-pip { display: inline-block; width: 6px; height: 6px; margin-left: 6px; border-radius: 50%; background: var(--tw-sun); vertical-align: middle; }
.gm-shop-row .gm-price { font-family: var(--tw-mono); color: var(--tw-sun); font-size: var(--tw-fs-sm); white-space: nowrap; }
.gm-shop-row .gm-price small { display: inline; color: var(--tw-ink-3); margin-left: var(--tw-1); }
.gm-shop-row.is-owned span:first-child { color: var(--tw-aqua); }
.gm-shop-act { display: flex; align-items: center; gap: var(--tw-2); }

.gm-crew { display: grid; grid-template-columns: 1fr 1fr; gap: var(--tw-2); padding: 2px 0 var(--tw-2); }
.gm-crew-card { display: flex; flex-direction: column; gap: var(--tw-1); padding: var(--tw-2); border-radius: var(--tw-r-md); background: var(--tw-fill); border: 1px solid var(--tw-line); }
.gm-crew-card.is-playing { border-color: rgba(var(--tw-aqua-rgb), 0.55); box-shadow: 0 0 0 1px rgba(var(--tw-aqua-rgb), 0.25); }
.gm-crew-card.is-locked { opacity: 0.78; }
.gm-crew-face { display: grid; place-items: center; height: 64px; border-radius: var(--tw-r-sm); background: radial-gradient(60% 80% at 50% 60%, rgba(12, 18, 26, 0.55), rgba(4, 9, 15, 0.9)); overflow: hidden; }
.gm-crew-face img { height: 64px; max-width: 100%; object-fit: contain; filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.55)); }
.gm-crew-card.is-locked .gm-crew-face img { filter: grayscale(0.7) brightness(0.6) drop-shadow(0 4px 8px rgba(0, 0, 0, 0.55)); }
.gm-crew-name { display: flex; justify-content: space-between; align-items: baseline; gap: var(--tw-2); font-weight: 600; }
.gm-crew-name em { font-style: normal; font-size: var(--tw-fs-xs); font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--tw-aqua); }
.gm-crew-tag { color: var(--tw-ink-3); font-size: var(--tw-fs-sm); line-height: 1.4; min-height: 2.8em; }
.gm-crew-how { color: var(--tw-ink-3); font-size: var(--tw-fs-xs); }
.gm-crew-card .gm-btn { align-self: flex-start; padding: calc(5 * var(--tw-u)) var(--tw-3); font-size: var(--tw-fs-sm); }

.gm-quest { display: grid; grid-template-columns: 1fr auto; gap: var(--tw-2) var(--tw-3); align-items: center; padding: var(--tw-2) 0; border-bottom: 1px solid var(--tw-line); }
.gm-quest-head { display: flex; justify-content: space-between; align-items: baseline; gap: var(--tw-2); font-weight: 600; }
.gm-quest-head small { font-weight: 500; color: var(--tw-ink-3); font-size: var(--tw-fs-xs); letter-spacing: 0.1em; text-transform: uppercase; }
.gm-quest.is-story .gm-quest-head small { color: var(--tw-sun); }
.gm-quest-text { color: var(--tw-ink-2); font-size: var(--tw-fs-sm); line-height: 1.45; margin: 2px 0 var(--tw-1); }
.gm-quest-meter { display: flex; align-items: center; gap: var(--tw-2); font-family: var(--tw-mono); font-size: var(--tw-fs-xs); color: var(--tw-ink-3); }
.gm-quest-bar { flex: 1; height: calc(5 * var(--tw-u)); border-radius: 99px; background: var(--tw-fill-2); overflow: hidden; }
.gm-quest-bar > span { display: block; height: 100%; width: 0; background: var(--tw-aqua); border-radius: inherit; transition: width var(--tw-med) var(--tw-ease); }
.gm-quest.is-done .gm-quest-bar > span { background: var(--tw-sun); }
.gm-quest-side { display: flex; flex-direction: column; align-items: flex-end; gap: var(--tw-1); }
.gm-quest-reward { display: flex; align-items: center; gap: var(--tw-2); font-family: var(--tw-mono); color: var(--tw-sun); font-size: var(--tw-fs-sm); white-space: nowrap; }
.gm-quest-reward small { color: var(--tw-ink-3); font-family: var(--tw-font); }
.gm-quest-face { width: calc(28 * var(--tw-u)); height: calc(28 * var(--tw-u)); border-radius: 50%; object-fit: cover; object-position: 50% 15%; background: rgba(4, 9, 15, 0.8); box-shadow: 0 0 0 1px var(--tw-line-2); }
.gm-quest .gm-btn { padding: calc(5 * var(--tw-u)) var(--tw-3); font-size: var(--tw-fs-sm); }

.gm-chat { display: flex; flex-direction: column; gap: var(--tw-2); padding: var(--tw-2) 0; min-height: calc(60 * var(--tw-u)); max-height: calc(150 * var(--tw-u)); overflow: auto; }
.gm-chat-line { max-width: 88%; padding: calc(5 * var(--tw-u)) var(--tw-3); border-radius: var(--tw-r-md); font-size: var(--tw-fs-sm); line-height: 1.45; }
.gm-chat-line.is-roid { align-self: flex-start; background: var(--tw-fill); border: 1px solid var(--tw-line); color: var(--tw-ink); }
.gm-chat-line.is-you { align-self: flex-end; background: rgba(var(--tw-aqua-rgb), 0.16); color: var(--tw-ink-2); }
.gm-topics { display: flex; flex-direction: column; gap: var(--tw-1); padding: var(--tw-2) 0; border-top: 1px solid var(--tw-line); }
.gm-topic { text-align: left; font: 500 var(--tw-fs-sm) var(--tw-font); color: var(--tw-ink-2); background: var(--tw-fill); border: 1px solid var(--tw-line); border-radius: var(--tw-r-md); padding: calc(5 * var(--tw-u)) var(--tw-3); cursor: pointer; transition: background var(--tw-fast), color var(--tw-fast); }
.gm-topic:hover { background: var(--tw-fill-2); color: var(--tw-ink); }

.gm-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--tw-1) var(--tw-2); margin-top: var(--tw-3); padding-top: var(--tw-3); border-top: 1px solid var(--tw-line); }
.gm-stats div { display: flex; flex-direction: column; }
.gm-stats span { color: var(--tw-ink-3); font-size: var(--tw-fs-xs); letter-spacing: 0.08em; text-transform: uppercase; }
.gm-stats b { font: 500 var(--tw-fs-md) var(--tw-mono); color: var(--tw-ink); }
`;

let cssInstalled = false;

export function installHudPanels( GameHUD ) {

	if ( ! cssInstalled && typeof document !== 'undefined' ) {

		const style = document.createElement( 'style' );
		style.textContent = CSS;
		document.head.append( style );
		cssInstalled = true;

	}

	const P = GameHUD.prototype;
	const baseRefresh = P.refresh, baseOpenStand = P.openStand, baseToggleInventory = P.toggleInventory;

	// ---- the roster is one more panel: it re-renders with the others and gives way to them
	P.refresh = function () {

		baseRefresh.call( this );
		if ( this.rosterOpen ) this.renderRoster();

	};

	P.openStand = function ( vendor ) {

		this.toggleRoster( false );
		if ( vendor && vendor.kind === 'yard' ) {

			this.yardTab = 'yard'; // a fresh visit: the yard, an empty chat log
			this.roidLog = [];

		}

		this.yardPort = vendor && vendor.kind === 'yard' ? vendor.port || null : null; // wave 14C: a harbour agent's yard window
		baseOpenStand.call( this, vendor );
		if ( vendor && vendor.kind === 'yard' && ! vendor.port ) roidClicks( this, 'open' );

	};

	P.toggleInventory = function ( force ) {

		const open = force ?? ! this.invOpen;
		if ( open ) this.toggleRoster( false );
		baseToggleInventory.call( this, force );

	};

	// ---- Ethena: gear, crew
	P.renderShop = function () {

		const s = this.game.state;
		const v = this.vendor || { name: 'Ethena Prosper', greeting: 'What do you need?' };
		const tab = this.shopTab === 'crew' ? 'crew' : 'gear';
		let body, foot;
		const sub = s.free ? 'Free in sandbox' : `You have $${ s.money.toLocaleString() }`;
		if ( tab === 'crew' ) {

			body = crewCards( s, this.game.app && this.game.app.features ? this.game.app.features.get( 'crew' ) : null, s.free ? 'Free in sandbox: the whole crew is unlocked' : 'Ethena hires out the crew; PoorGoat\'s quests earn the rest' );
			foot = `${ s.unlocked.length } of ${ Object.keys( CHARACTERS ).length } in the crew`;

		} else {

			const standing = this.game.app?.features?.get( 'trade' )?.credit?.standing ?? null;
			const off = this.game.chandlerDiscount ? this.game.chandlerDiscount() : 0; // wave 13: the story's discount here
			const rows = Object.entries( UPGRADES ).map( ( [ key, track ] ) => {

				const cur = track.levels[ s.upgrades[ key ] | 0 ];
				const next = nextLevel( s.upgrades, key );
				const gate = gearGate( s, key, standing );
				const cost = next ? Math.round( next.cost * ( 1 - off ) ) : 0;
				const btn = next
					? `<button class="gm-btn" data-buy="${ key }" ${ ( cost > s.money && ! s.free ) || ! gate.ok ? 'disabled' : '' }>${ s.free ? 'Free' : `$${ cost }` }</button>`
					: '<span class="gm-have">Top of the line</span>';
				const needs = next && gate.why === 'locked' ? ` · Needs: ${ gate.reasons.join( ', ' ) }` : '';
				return `<div class="gm-shop-row"><span>${ track.name }: ${ next ? next.label : cur.label }<small>Now: ${ cur.label }${ needs }</small></span>${ btn }</div>`;

			} ).join( '' );
			const missing = s.stats.fuelL - s.fuelL;
			const fuelRow = `<div class="gm-shop-row"><span>Diesel · $${ FUEL_PRICE.toFixed( 2 ) } / L<small>Tank: ${ s.fuelL.toFixed( 0 ) } of ${ s.stats.fuelL } L</small></span>${ missing > 0.5 ? `<button class="gm-btn" data-fuel ${ s.money < FUEL_PRICE && ! s.free ? 'disabled' : '' }>Fill · ${ s.free ? 'free' : `$${ s.refuelCost() }` }</button>` : '<span class="gm-have">Full</span>' }</div>`;
			const rodRow = s.rodBroken ? `<div class="gm-shop-row"><span>Rod repair<small>Your rod broke in a fight: hauled too hard past the line's strength</small></span><button class="gm-btn" data-rodfix ${ ! s.free && s.rodRepairCost() > s.money ? 'disabled' : '' }>${ s.free ? 'Fix · free' : `Fix · $${ s.rodRepairCost() }` }</button></div>` : '';
			const guns = this.game.app && this.game.app.features && this.game.app.features.get( 'firearms' );
			body = rodRow + fuelRow + ( guns && guns.shopRows ? guns.shopRows() : '' ) + ( this.game.app?.features?.get( 'weapons' )?.shopRows?.() || '' ) + ( this.game.app?.features?.get( 'rescue' )?.shopRows?.() || '' ) + rows;
			foot = s.free ? 'Free in sandbox · upgrades take effect at once' : 'Upgrades take effect at once';

		}

		this.stand.innerHTML = `
			<h2>${ v.name }</h2>
			<p class="gm-sub">${ v.greeting || '' } · ${ sub }</p>
			${ tabs( [ [ 'gear', 'Gear' ], [ 'crew', 'Crew' ] ], tab ) }
			<div class="gm-list">${ body }</div>
			<div class="gm-foot"><span class="gm-sub">${ foot }</span><button class="gm-btn is-ghost" data-close>Leave (E)</button></div>`;
		bindTabs( this.stand, ( t ) => { this.shopTab = t; this._keepScroll( () => this.renderShop() ); } );
		this.stand.querySelector( '[data-close]' ).onclick = () => this.closeStand();
		for ( const b of this.stand.querySelectorAll( '[data-buy]' ) ) b.onclick = () => this.game.buy( b.dataset.buy );
		const f = this.stand.querySelector( '[data-fuel]' );
		if ( f ) f.onclick = () => this.game.refuel();
		const rf = this.stand.querySelector( '[data-rodfix]' );
		if ( rf ) rf.onclick = () => { if ( this.game.state.repairRod() ) { this.game.toast( 'Rod repaired', 1600 ); this._keepScroll( () => this.renderShop() ); } };
		for ( const b of this.stand.querySelectorAll( '[data-gun]' ) ) b.onclick = () => { const g = this.game.app && this.game.app.features && this.game.app.features.get( 'firearms' ); if ( g ) g.buy( b.dataset.gun ); this._keepScroll( () => this.renderShop() ); };
		for ( const b of this.stand.querySelectorAll( '[data-wpn]' ) ) b.onclick = () => { const w = this.game.app?.features?.get( 'weapons' ); if ( w ) w.buy( b.dataset.wpn ); this._keepScroll( () => this.renderShop() ); }; // wave 18D
		for ( const b of this.stand.querySelectorAll( '[data-flare]' ) ) b.onclick = () => { const r = this.game.app?.features?.get( 'rescue' ); if ( r ) r.buy(); this._keepScroll( () => this.renderShop() ); }; // wave 15D: distress flares
		bindCrew( this, this.stand );

	};

	// ---- Captain Roid: the boat yard
	// ---- the swivel gun and hull repairs (src/features/naval), sold at the yard
	function navalOf( hud ) {

		const F = hud.game.app && hud.game.app.features;
		return F ? F.get( 'naval' ) : null;

	}

	function yardExtras( hud ) {

		const nv = navalOf( hud ), s = hud.game.state;
		const boatId = ( hud.game.app && hud.game.app.boatId ) || s.boat; // (the sandbox hands out boats without writing the save)
		// the seaplane wreck (src/features/seaplane Crash.js): recovered here before anything else
		const sp = hud.game.app && hud.game.app.features ? hud.game.app.features.get( 'seaplane' ) : null;
		const spv = sp && sp.view ? sp.view() : null;
		const wreckRow = spv && spv.lost ? `<div class="gm-shop-row"><span>Recover the seaplane wreck<small>She broke up out there · towed to the ramp, then repair her at the hangar</small></span><span class="gm-shop-act"><span class="gm-price">${ s.free ? 'Free in sandbox' : '$' + ( sp.recoveryCost ? sp.recoveryCost() : 600 ).toLocaleString() }</span><button class="gm-btn" data-recover-plane ${ ! s.free && sp.recoveryCost && sp.recoveryCost() > s.money ? 'disabled' : '' }>Recover</button></span></div>` : '';
		if ( ! nv || ! boatId ) return wreckRow;
		// she lies on the sea floor: salvage first (naval.wreck / salvage)
		// wave 15C: a stolen hull is wanted until the yard repaints her
		const hjRow = ( () => { const hj = this.game.app?.features?.get( 'hijack' ); const row = hj && hj.yardRow ? hj.yardRow() : null; return row ? `<div class="gm-shop-row"><span>${ row.label }<small>${ row.note }</small></span><span class="gm-shop-act"><span class="gm-price">${ s.free ? 'Free in sandbox' : '$' + row.price.toLocaleString() }</span><button class="gm-btn" data-repaint ${ row.disabled || ( ! s.free && row.price > s.money ) ? 'disabled' : '' }>Repaint</button></span></div>` : ''; } )();
		if ( nv.wreck && nv.salvageCost ) { const cost = nv.salvageCost(); return hjRow + wreckRow + `<div class="gm-shop-row"><span>Salvage ${ BOATS[ boatId ].name }<small>She lies on the sea floor · raised and moored at her berth with her hold</small></span><span class="gm-shop-act"><span class="gm-price">${ s.free ? 'Free in sandbox' : '$' + cost.toLocaleString() }</span><button class="gm-btn" data-salvage ${ ! s.free && cost > s.money ? 'disabled' : '' }>Salvage</button></span></div>`; }
		const g = nv.playerGun;
		// wave 11: powder and shot, rigging / rudder / sail repairs (naval Ammo.js / Sections.js)
		const q = nv.shotQuote ? nv.shotQuote() : null, sc = nv.sectionRepairCost ? nv.sectionRepairCost() : 0;
		const extra = ( q && nv.ammo && nv.ammo.max > 0 ? `<div class="gm-shop-row"><span>Powder and shot x12<small>${ nv.ammo.rounds } / ${ nv.ammo.max } rounds aboard</small></span><span class="gm-shop-act">${ q.rounds > 0 ? `<span class="gm-price">${ s.free ? 'Free in sandbox' : '$' + q.price }</span><button class="gm-btn" data-shot ${ ! s.free && q.price > s.money ? 'disabled' : '' }>Buy</button>` : '<span class="gm-have">Magazine full</span>' }</span></div>` : '' )
			+ ( nv.sections && nv.sections.damaged ? `<div class="gm-shop-row"><span>Rigging and rudder repairs<small>${ nv.sections.pips().map( ( p ) => `${ p.label } ${ Math.round( p.frac * 100 ) }%` ).join( ' · ' ) }</small></span><span class="gm-shop-act"><span class="gm-price">${ s.free ? 'Free in sandbox' : '$' + sc }</span><button class="gm-btn" data-rig ${ ! s.free && sc > s.money ? 'disabled' : '' }>Repair</button></span></div>` : '' );
		if ( g.builtIn ) {

			const h = nv.playerHull, cost = nv.repairCost();
			const hullRow = h.hp >= h.max - 0.5 ? '<span class="gm-have">Hull sound</span>'
				: `<span class="gm-price">${ s.free ? 'Free in sandbox' : '$' + cost.toLocaleString() }</span><button class="gm-btn" data-repair ${ ! s.free && cost > s.money ? 'disabled' : '' }>Repair</button>`;
			return `<div class="gm-shop-row"><span>Broadside battery<small>${ g.guns } guns a side · Z fires to port, X to starboard</small></span><span class="gm-shop-act"><span class="gm-have">Built in</span></span></div>`
				+ `<div class="gm-shop-row"><span>Hull repairs<small>${ Math.round( h.hp ) } / ${ h.max } hull points</small></span><span class="gm-shop-act">${ hullRow }</span></div>` + extra;

		}

		// (the swivel gun is a module now: modulesSection below)
		const h = nv.playerHull, cost = nv.repairCost();
		const hullRow = h.hp >= h.max - 0.5 ? '<span class="gm-have">Hull sound</span>'
			: `<span class="gm-price">${ s.free ? 'Free in sandbox' : '$' + cost.toLocaleString() }</span><button class="gm-btn" data-repair ${ ! s.free && cost > s.money ? 'disabled' : '' }>Repair</button>`;
		return `<div class="gm-shop-row"><span>Hull repairs<small>${ Math.round( h.hp ) } / ${ h.max } hull points</small></span><span class="gm-shop-act">${ hullRow }</span></div>` + extra;

	}

	function bindYardExtras( hud ) {

		const nv = navalOf( hud ), s = hud.game.state;
		if ( ! nv ) return;
		const rpt = hud.stand.querySelector( '[data-repaint]' );
		if ( rpt ) rpt.onclick = () => { const hj = hud.game.app?.features?.get( 'hijack' ); const r = hj && hj.repaint ? hj.repaint( { free: !! s.free } ) : null; if ( r && r.ok ) { roidClicks( hud, 'buy' ); s.save(); } if ( r && r.reason ) hud.game.toast( r.reason, 3000 ); hud._keepScroll( () => hud.renderYard() ); };
		const rp = hud.stand.querySelector( '[data-recover-plane]' );
		if ( rp ) rp.onclick = () => { const sp = hud.game.app && hud.game.app.features ? hud.game.app.features.get( 'seaplane' ) : null; const r = sp && sp.recall ? sp.recall() : null; if ( r && r.ok ) { roidClicks( hud, 'buy' ); s.save(); } if ( r && r.text ) hud.game.toast( r.text, 3000 ); hud._keepScroll( () => hud.renderYard() ); };
		const sb = hud.stand.querySelector( '[data-salvage]' );
		if ( sb ) sb.onclick = () => { if ( nv.salvage( { free: !! s.free } ) ) { roidClicks( hud, 'buy' ); s.save(); } hud._keepScroll( () => hud.renderYard() ); };
		const shot = hud.stand.querySelector( '[data-shot]' );
		if ( shot ) shot.onclick = () => { const r = nv.buyShot ? nv.buyShot( { free: !! s.free } ) : null; if ( r && r.ok ) { roidClicks( hud, 'buy' ); s.save(); } hud._keepScroll( () => hud.renderYard() ); };
		const rig = hud.stand.querySelector( '[data-rig]' );
		if ( rig ) rig.onclick = () => { if ( nv.repairSections && nv.repairSections( { free: !! s.free } ) ) { roidClicks( hud, 'buy' ); s.save(); } hud._keepScroll( () => hud.renderYard() ); };
		const rb = hud.stand.querySelector( '[data-repair]' );
		if ( rb ) rb.onclick = () => {

			if ( nv.repair( { free: !! s.free } ) ) {

				roidClicks( hud, 'buy' );
				s.save();

			}

			hud._keepScroll( () => hud.renderYard() );

		};

	}

	// ---- ship modules (src/features/naval/Modules.js): slots per hull, bought, fitted and removed at the yard
	function modulesSection( hud ) {

		const nv = navalOf( hud ), s = hud.game.state;
		if ( ! nv || ! nv.moduleRows || ! s.boat ) return '';
		const slots = nv.moduleSlots().map( ( x ) => `${ x.label }: ${ x.moduleLabel || 'empty' }` ).join( ' · ' );
		const rows = nv.moduleRows( s ).map( ( r ) => {

			const buy = r.price === null ? '<span class="gm-have">Top tier</span>'
				: `<button class="gm-btn" data-mod-buy="${ r.id }" ${ r.canBuy ? '' : 'disabled' }>${ s.free ? 'Free' : '$' + r.price.toLocaleString() }</button>`;
			const fit = r.fitted ? `<button class="gm-btn is-ghost" data-mod-off="${ r.id }">Remove</button>`
				: r.canFit ? `<button class="gm-btn is-ghost" data-mod-fit="${ r.id }">Fit</button>` : '';
			const tier = r.tier ? ` · ${ r.tier }/${ r.maxTier }` : '';
			const why = r.reason && ! r.fitted ? `${ r.reason } ` : '';
			return `<div class="gm-shop-row ${ r.fitted ? 'is-owned' : '' }"><span>${ r.label }${ tier }<small>${ why }${ r.desc }</small></span><span class="gm-shop-act">${ fit }${ buy }</span></div>`;

		} ).join( '' );
		return `<div class="gm-shop-row"><span>Modules<small>${ slots }</small></span></div>` + rows;

	}

	function bindModules( hud ) {

		const nv = navalOf( hud ), s = hud.game.state;
		if ( ! nv || ! nv.moduleRows ) return;
		const done = ( ok ) => {

			if ( ok ) {

				roidClicks( hud, 'buy' );
				s.save();

			}

			hud._keepScroll( () => hud.renderYard() );

		};
		for ( const b of hud.stand.querySelectorAll( '[data-mod-buy]' ) ) b.onclick = () => done( nv.buyModule( b.dataset.modBuy ).ok );
		for ( const b of hud.stand.querySelectorAll( '[data-mod-fit]' ) ) b.onclick = () => done( nv.fitModule( b.dataset.modFit ) );
		for ( const b of hud.stand.querySelectorAll( '[data-mod-off]' ) ) b.onclick = () => done( nv.removeModule( b.dataset.modOff ) );

	}

	P.renderYard = function () {

		// wave 14C: at a harbour agent the agents feature draws the window
		const ag = this.yardPort && this.game.app && this.game.app.features ? this.game.app.features.get( 'agents' ) : null;
		if ( ag && ag.renderYard( this ) ) return;

		const s = this.game.state;
		const v = this.vendor || { name: 'Captain Roid · Boat yard', greeting: '' };
		const tab = this.yardTab === 'talk' ? 'talk' : 'yard';
		let body, foot;
		if ( tab === 'talk' ) {

			body = talkBody( this );
			foot = 'Ask him anything · he answers in clicks and calls';

		} else {

			const rows = Object.entries( BOATS ).map( ( [ id, b ] ) => {

				const owned = s.boat === id;
				const price = s.boatPrice( id );
				const btn = owned ? '<span class="gm-have">Yours</span>'
					: s.free ? `<span class="gm-price">Free in sandbox</span><button class="gm-btn" data-boat="${ id }">Take</button>`
					: `<span class="gm-price">${ s.boat ? '<small>Trade in</small>' : '' }$${ price.toLocaleString() }</span><button class="gm-btn" data-boat="${ id }" ${ price > s.money ? 'disabled' : '' }>${ s.boat ? 'Trade' : 'Buy' }</button>`;
				return `<div class="gm-shop-row ${ owned ? 'is-owned' : '' }" data-boat-id="${ id }"><span>${ b.name }<small>${ b.description }</small></span><span class="gm-shop-act">${ btn }</span></div>`;

			} ).join( '' );
			body = rows + yardExtras( this ) + modulesSection( this );
			foot = s.free ? ( s.boat ? `Free in sandbox · your ${ BOATS[ s.boat ].name } is moored at the pier head` : 'Free in sandbox · pick any boat, it is moored at the pier head' )
				: s.boat ? `Your ${ BOATS[ s.boat ].name } is moored at the pier head` : 'You are on foot. A boat is moored at the pier head once you buy one';

		}

		this.stand.innerHTML = `
			<h2>${ v.name }</h2>
			<p class="gm-sub">${ v.greeting || '' } · ${ s.free ? 'Free in sandbox' : `You have $${ s.money.toLocaleString() }` }</p>
			${ tabs( [ [ 'yard', 'Yard' ], [ 'talk', 'Talk' ] ], tab ) }
			<div class="gm-list">${ body }</div>
			<div class="gm-foot"><span class="gm-sub">${ foot }</span><button class="gm-btn is-ghost" data-close>Leave (E)</button></div>`;
		bindTabs( this.stand, ( t ) => { this.yardTab = t; this._keepScroll( () => this.renderYard() ); } );
		this.stand.querySelector( '[data-close]' ).onclick = () => this.closeStand();
		if ( tab === 'talk' ) {

			bindTalk( this );
			return;

		}

		bindYardExtras( this );
		bindModules( this );
		for ( const b of this.stand.querySelectorAll( '[data-boat]' ) ) {

			b.onclick = () => {

				if ( this.game.buyBoat( b.dataset.boat ) ) roidClicks( this, 'buy' );

			};

		}

		// a tick of the clicks on each boat he shows you (at most one every 150 ms)
		for ( const r of this.stand.querySelectorAll( '[data-boat-id]' ) ) {

			r.onmouseenter = () => {

				const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
				if ( now - ( this._yardHover ?? - 1e9 ) < 150 ) return;
				this._yardHover = now;
				roidClicks( this, 'hover' );

			};

		}

	};

	// ---- PoorGoat: sell, quests (GameHUD.refresh calls renderStand for every vendor that is not a shop:
	// the yard is routed to Roid's panel here)
	const renderJoe = function () {

		const s = this.game.state;
		const v = this.vendor || { name: 'Fish buyer' };
		const tab = this.standTab || 'sell';
		const contracts = this.game.contracts;
		const quests = contracts ? contracts.active : [];
		const ready = quests.filter( ( q ) => q.done ).length;
		let body, foot;
		if ( tab === 'quests' ) {

			body = quests.map( ( q ) => questRow( q ) ).join( '' ) || '<div class="gm-empty">No work on the board today.</div>';
			foot = `<span class="gm-sub">${ ready ? `${ ready } ready to hand in` : 'Fish, come back, get paid' }</span><button class="gm-btn is-ghost" data-close>Leave (E)</button>`;

		} else {

			const rows = s.inventory.map( ( f ) => `<div class="gm-row has-cm"><span>${ FISH[ f.species ].name }</span><span class="gm-cm">${ f.cm ?? Math.round( fishLengthCm( f.species, f.kg ) ) } cm</span><span class="gm-kg">${ f.kg.toFixed( 2 ) } kg</span><span class="gm-val">$${ f.value }</span><button class="gm-mini" data-sell="${ f.id }">Sell</button></div>` ).join( '' );
			body = rows || '<div class="gm-empty">Your cooler is empty.</div>';
			foot = `<button class="gm-btn is-ghost" data-close>Leave (E)</button><button class="gm-btn" data-all ${ s.inventory.length ? '' : 'disabled' }>Sell all · $${ s.holdValue }</button>`;

		}

		this.stand.innerHTML = `
			<h2>${ v.name }</h2>
			<p class="gm-sub">${ s.inventory.length ? v.greeting || 'Let\'s see what you caught.' : v.idle || 'Come back when you\'ve got fish.' }</p>
			${ tabs( [ [ 'sell', 'Sell' ], [ 'quests', `Quests${ ready ? '<i class="gm-pip"></i>' : '' }` ] ], tab ) }
			<div class="gm-list">${ body }</div>
			<div class="gm-foot">${ foot }</div>`;
		bindTabs( this.stand, ( t ) => { this.standTab = t; this.renderStand(); } );
		this.stand.querySelector( '[data-close]' ).onclick = () => this.closeStand();
		const all = this.stand.querySelector( '[data-all]' );
		if ( all ) all.onclick = () => this.game.sellAll();
		for ( const b of this.stand.querySelectorAll( '[data-sell]' ) ) b.onclick = () => this.game.sell( [ Number( b.dataset.sell ) ] );
		for ( const b of this.stand.querySelectorAll( '[data-deliver]' ) ) b.onclick = () => this.game.deliverContract( b.dataset.deliver );

	};

	P.renderStand = function () {

		if ( this.vendor && this.vendor.kind === 'yard' ) this._keepScroll( () => this.renderYard() );
		else renderJoe.call( this );

	};

	// ---- the roster on its own (K)
	P.openRoster = function () {

		this.toggleRoster( true );

	};

	P.toggleRoster = function ( force ) {

		const open = force ?? ! this.rosterOpen;
		this.rosterOpen = open;
		if ( open ) {

			if ( ! this.roster ) {

				this.roster = document.createElement( 'div' );
				this.roster.className = 'gm-panel tw-glass tw-interactive';
				this.ui.root.append( this.roster );

			}

			this.closeStand();
			baseToggleInventory.call( this, false );
			this.renderRoster();
			releaseMouse();

		}

		if ( this.roster ) this.roster.classList.toggle( 'is-open', open );

	};

	P.renderRoster = function () {

		if ( ! this.roster ) return;
		const s = this.game.state;
		const c = CHARACTERS[ s.character ];
		this.roster.innerHTML = `
			<h2>Crew</h2>
			<p class="gm-sub">Playing as ${ c ? c.name : s.character } · ${ s.unlocked.length } of ${ Object.keys( CHARACTERS ).length } unlocked</p>
			<div class="gm-list">${ crewCards( s, this.game.app && this.game.app.features ? this.game.app.features.get( 'crew' ) : null, s.free ? 'Free in sandbox: every crew member is unlocked' : 'Hire at Ethena\'s or finish PoorGoat\'s quests to unlock the rest' ) }</div>
			<div class="gm-foot"><span class="gm-sub">Change takes effect at once</span><button class="gm-btn is-ghost" data-close>Close (K)</button></div>`;
		this.roster.querySelector( '[data-close]' ).onclick = () => this.toggleRoster( false );
		bindCrew( this, this.roster );

	};

	// ---- career stats (the inventory footer)
	P.renderStats = function () {

		const c = this.game.state.career || {};
		const secs = c.playSeconds | 0;
		const played = secs >= 3600 ? `${ Math.floor( secs / 3600 ) } h ${ Math.floor( secs % 3600 / 60 ) } m` : `${ Math.floor( secs / 60 ) } m`;
		const cell = ( label, value ) => `<div><span>${ label }</span><b>${ value }</b></div>`;
		const pr = this.game.state.progress;
		const toNext = Math.max( 0, Math.ceil( pr.nextXp - pr.xp ) );
		return `<div class="gm-stats">
			${ cell( 'Level', pr.level ) }${ cell( 'Rank', pr.title ) }${ cell( 'XP', `${ Math.floor( pr.xp ) } · ${ toNext } to next` ) }
			${ cell( 'Caught', c.caught | 0 ) }${ cell( 'Weight', `${ ( c.kg || 0 ).toFixed( 1 ) } kg` ) }${ cell( 'Records', c.records | 0 ) }${ cell( 'Species', c.species | 0 ) }
			${ cell( 'Night', c.night | 0 ) }${ cell( 'Reef', c.reef | 0 ) }${ cell( 'Deep', c.deep | 0 ) }${ cell( 'Afloat', c.aboard | 0 ) }
			${ cell( 'Sold', c.sold | 0 ) }${ cell( 'Earned', `$${ ( c.earned | 0 ).toLocaleString() }` ) }${ cell( 'Boats', c.boats | 0 ) }${ cell( 'Played', played ) }
		</div>`;

	};

}

// ---- pieces

// Captain Roid's clicks, through game.roid (set by the root); silent when he is not in the game
function roidClicks( hud, kind ) {

	try {

		const r = hud.game && hud.game.roid;
		if ( r && kind === 'open' && r.opened ) r.opened();
		if ( r && r.clicks ) r.clicks.burst( kind );

	} catch ( e ) { /* audio is optional */ }

}

// ---- Roid's Talk tab: the chat log and the topic buttons
const esc = ( t ) => String( t ).replace( /&/g, '&amp;' ).replace( /</g, '&lt;' ).replace( />/g, '&gt;' );

function talkBody( hud ) {

	const log = hud.roidLog || ( hud.roidLog = [] );
	const lines = log.map( ( l ) => `<div class="gm-chat-line is-${ l.who }">${ esc( l.text ) }</div>` ).join( '' ) || '<div class="gm-empty">Ask him something. He answers in clicks and calls; the words come as subtitles.</div>';
	// the story feature's memory-driven topics (what he remembers of you) sit before Goodbye
	const story = hud.game.app && hud.game.app.features && hud.game.app.features.get( 'story' );
	const list = [ ...TOPICS.slice( 0, - 1 ), ...( story ? story.roidTopics() : [] ), TOPICS[ TOPICS.length - 1 ] ];
	const topics = list.map( ( t ) => `<button class="gm-topic" data-topic="${ t.id }">${ esc( t.label ) }</button>` ).join( '' );
	return `<div class="gm-chat" data-chat>${ lines }</div><div class="gm-topics">${ topics }</div>`;

}

function bindTalk( hud ) {

	const chat = hud.stand.querySelector( '[data-chat]' );
	if ( chat ) chat.scrollTop = chat.scrollHeight; // the latest line in view
	for ( const b of hud.stand.querySelectorAll( '[data-topic]' ) ) b.onclick = () => askRoid( hud, b.dataset.topic );

}

// ask a topic: your question at once, his phrases as their calls start (game.roid.say; without him in the
// game the text of the line is shown whole). Goodbye closes the panel after the farewell starts.
function askRoid( hud, id ) {

	if ( id.startsWith( 'story:' ) ) {

		// a story topic: the story feature answers from his memory of the player
		const st = hud.game.app.features.get( 'story' );
		const t = st.roidTopics().find( ( x ) => x.id === id );
		const res = st.roidAsk( id );
		const log = hud.roidLog || ( hud.roidLog = [] );
		if ( t ) log.push( { who: 'you', text: t.label } );
		for ( const l of res.lines ) log.push( { who: 'roid', text: l } );
		roidClicks( hud, 'hover' );
		if ( res.close ) hud.closeStand(); else hud._keepScroll( () => hud.renderYard() );
		return;

	}

	const topic = TOPICS.find( ( t ) => t.id === id );
	if ( ! topic ) return;
	const log = hud.roidLog || ( hud.roidLog = [] );
	if ( ! topic.closes ) log.push( { who: 'you', text: topic.label } );
	const add = ( ph ) => {

		if ( topic.closes || hud.roidLog !== log ) return; // the farewell is subtitles only; a new visit has a new log
		log.push( { who: 'roid', text: ph.text } );
		if ( hud.standOpen && hud.vendor && hud.vendor.kind === 'yard' && hud.yardTab === 'talk' ) hud._keepScroll( () => hud.renderYard() );

	};

	const r = hud.game && hud.game.roid;
	try {

		if ( r && r.say ) r.say( topic.kind, add );
		else {

			const said = linePhrases( topic.kind );
			if ( said ) for ( const ph of said.phrases ) add( ph );

		}

	} catch ( e ) { /* audio is optional */ }

	if ( topic.closes ) hud.closeStand();
	else hud._keepScroll( () => hud.renderYard() );

}

function tabs( list, on ) {

	return `<div class="gm-tabs">${ list.map( ( [ id, label ] ) => `<button class="gm-tab ${ id === on ? 'is-on' : '' }" data-tab="${ id }">${ label }</button>` ).join( '' ) }</div>`;

}

function bindTabs( root, pick ) {

	for ( const b of root.querySelectorAll( '[data-tab]' ) ) b.onclick = () => pick( b.dataset.tab );

}

// one card per character: playing / unlocked (Play as) / hire / locked by a quest
function crewCards( s, crew, note ) {

	const cards = Object.entries( CHARACTERS ).map( ( [ id, c ] ) => {

		const playing = s.character === id, unlocked = s.isUnlocked( id );
		let state, action;
		if ( playing ) { state = '<em>Playing</em>'; action = ''; }
		else if ( unlocked ) { state = ''; action = `<button class="gm-btn" data-play="${ id }">Play as</button>`; }
		else if ( c.unlock.kind === 'buy' ) { state = ''; action = `<button class="gm-btn" data-hire="${ id }" ${ c.unlock.cost > s.money ? 'disabled' : '' }>Hire $${ c.unlock.cost }</button>`; }
		else { state = ''; action = `<span class="gm-crew-how">${ unlockText( id ) }</span>`; }
		return `<div class="gm-crew-card ${ playing ? 'is-playing' : unlocked ? '' : 'is-locked' }">
			<div class="gm-crew-face"><img src="${ portraitUrl( id ) }" alt="" draggable="false"></div>
			<div class="gm-crew-name"><span>${ c.name }</span>${ state }</div>
			<div class="gm-crew-tag">${ c.tagline }</div>
			${ crew && unlocked && ! playing ? crew.postHtml( id ) : '' }
			${ action }
		</div>`;

	} ).join( '' );
	return `<div class="gm-crew">${ cards }</div>${ crew ? `<p class="gm-sub">${ crew.berthNote() }</p>` : '' }${ note ? `<p class="gm-sub">${ note }</p>` : '' }`;

}

function bindCrew( hud, root ) {

	for ( const b of root.querySelectorAll( '[data-play]' ) ) b.onclick = () => hud.game.setCharacter( b.dataset.play );
	for ( const b of root.querySelectorAll( '[data-hire]' ) ) b.onclick = () => hud.game.unlockCharacter( b.dataset.hire );
	const crewF = hud.game.app && hud.game.app.features ? hud.game.app.features.get( 'crew' ) : null;
	if ( crewF && crewF.bindPosts ) crewF.bindPosts( root, () => ( root === hud.roster ? hud.renderRoster() : hud._keepScroll( () => hud.renderShop() ) ) );

}

// one quest on PoorGoat's board
function questRow( q ) {

	const pct = Math.min( 100, q.goal ? q.progress / q.goal * 100 : 0 );
	const kind = q.kind === 'order' ? 'Order' : q.kind === 'story' ? 'Crew' : 'Welcome';
	const unlock = q.reward.unlock && CHARACTERS[ q.reward.unlock ];
	const reward = q.kind === 'order'
		? `${ q.reward.rate }× <small>+ $${ q.reward.bonus }</small>`
		: `$${ q.reward.money }${ unlock ? `<img class="gm-quest-face" src="${ portraitUrl( q.reward.unlock ) }" alt="" title="Unlocks ${ unlock.name }">` : '' }`;
	const meter = q.kind === 'order' ? `${ q.progress } of ${ q.goal } in the hold` : `${ q.progress } / ${ q.goal }`;
	const btn = q.kind === 'order' ? 'Deliver' : 'Claim';
	return `<div class="gm-quest is-${ q.kind } ${ q.done ? 'is-done' : '' }">
		<div>
			<div class="gm-quest-head"><span>${ q.title }</span><small>${ kind }</small></div>
			<div class="gm-quest-text">${ q.text }</div>
			<div class="gm-quest-meter"><span class="gm-quest-bar"><span style="width:${ pct.toFixed( 0 ) }%"></span></span><span>${ meter }</span></div>
		</div>
		<div class="gm-quest-side">
			<div class="gm-quest-reward">${ reward }</div>
			<button class="gm-btn" data-deliver="${ q.id }" ${ q.done ? '' : 'disabled' }>${ btn }</button>
		</div>
	</div>`;

}

function releaseMouse() {

	try {

		if ( document.pointerLockElement && document.exitPointerLock ) document.exitPointerLock();

	} catch ( e ) { /* ignore */ }

}
