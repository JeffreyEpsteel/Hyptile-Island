import { PORT_INFO, progressText, fmtLeft } from '../features/notices/NoticeData.js';
import { STAND } from '../game/FishStand.js';
import { CAMP } from '../features/melee/MeleeData.js';

const esc = ( v ) => String( v ?? '' ).replace( /[&<>"']/g, ( c ) => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ c ] ) );
const point = ( p, label ) => p && Number.isFinite( p.x ) && Number.isFinite( p.z ) ? { x: p.x, z: p.z, label: label || p.label || 'Objective' } : null;

// One model for the journal and tracking. Positions come from live quest data; a
// fishing task without a fixed location deliberately has no invented destination.
export function questJournalModel( app, features ) {

	const rows = [], story = features?.get?.( 'story' ), notices = features?.get?.( 'notices' );
	const journal = story?.journal?.() || {};
	for ( const q of journal.active || [] ) rows.push( {
		id: 'story:' + q.id, source: 'Story', title: q.title, text: q.step, where: q.where || q.port,
		frac: q.frac, target: point( story.pinOf?.( q.id ) ), note: 'Complete the current objective to advance this story.',
	} );
	for ( const q of notices?.active || [] ) {

		if ( Number.isFinite( q.expires ) && q.expires <= notices.hours ) continue;
		const dest = PORT_INFO[ q.params?.port ];
		const target = q.kind === 'bounty' ? point( q.region, 'Last known search area' )
			: dest ? point( dest.anchor, dest.name ) : q.type === 'shoreRaider' ? point( CAMP, 'Raider camp' ) : null;
		rows.push( { id: 'notice:' + q.id, source: q.kind === 'bounty' ? 'Bounty' : 'Notice', title: q.title || q.target,
			noticeId: q.id,
			text: q.text, where: target?.label || PORT_INFO[ q.port ]?.name || '', frac: q.goal ? q.progress / q.goal : 0,
			progress: progressText( q ), target, note: Number.isFinite( q.expires ) ? `${ fmtLeft( q.expires - notices.hours ) } left · completes automatically when its objective is met.` : '',
		} );

	}
	for ( const q of app?.game?.contracts?.active || [] ) {

		if ( q.kind === 'chain' ) continue; // already listed once, independently of the nearby vendor
		rows.push( { id: 'contract:' + q.id, source: q.kind === 'order' ? 'Fish order' : 'Fishing', title: q.title,
			text: q.text, where: q.done ? 'PoorGoat · Hyptile Harbour' : 'Follow the fishing conditions in the objective.',
			frac: q.goal ? q.progress / q.goal : 0, progress: `${ q.progress } / ${ q.goal }`,
			target: q.done ? point( STAND, 'PoorGoat · claim reward' ) : null,
			note: q.done ? 'Ready to hand in. Visit PoorGoat and use the Quests tab.' : 'Catch progress is recorded automatically. Return to PoorGoat when ready.',
		} );

	}
	return { rows, entries: journal.entries || [], offers: journal.offers || [], recent: [ ...( journal.log || [] ), ...( notices?.notes || [] ) ].slice( 0, 6 ) };

}

export function questJournalHTML( model, selected, tracked ) {

	const q = model.rows.find( ( r ) => r.id === selected );
	const rows = model.rows.map( ( r ) => `<button type="button" class="qj-row${ r.id === selected ? ' is-selected' : '' }" data-qj-select="${ esc( r.id ) }" aria-pressed="${ r.id === selected }"><small>${ esc( r.source ) }${ r.id === tracked ? ' · TRACKED' : '' }</small><b>${ esc( r.title ) }</b><span>${ esc( r.progress || r.text ) }</span></button>` ).join( '' );
	const pct = Math.max( 0, Math.min( 100, Number( q?.frac || 0 ) * 100 ) );
	const detail = q ? `<small class="qj-eyebrow">${ esc( q.source ) } · CURRENT OBJECTIVE</small><h3>${ esc( q.title ) }</h3><p class="qj-objective">${ esc( q.text ) }</p><div class="nb-bar"><span style="width:${ pct.toFixed( 0 ) }%"></span></div><p class="qj-place">${ esc( q.where ) }</p><p class="qj-note">${ esc( q.note ) }</p>${ ! q.target ? '<p class="qj-note">This objective has no fixed map location. Its conditions are shown above.</p>' : '' }<div class="qj-actions"><button type="button" class="nb-btn" data-qj-map ${ q.target ? '' : 'disabled' }>Show on map ↗</button><button type="button" class="nb-btn is-ghost" data-qj-track>${ q.id === tracked ? 'Untrack' : 'Track quest' }</button>${ q.noticeId ? `<button type="button" class="nb-btn is-ghost" data-abandon="${ esc( q.noticeId ) }">Drop notice</button>` : '' }</div>` : '<div class="qj-empty"><b>Your next voyage starts here.</b><p>Select a quest to read its current objective and chart its destination.</p></div>';
	const offers = model.offers.map( ( r ) => `<p><b>${ esc( r.title ) }</b><br>${ esc( r.giver ) } · ${ esc( r.port ) }</p>` ).join( '' );
	const notes = model.entries.map( ( r ) => `<p><b>${ esc( r.title ) }</b><br>${ esc( r.text ) }</p>` ).join( '' );
	const recent = model.recent.map( ( r ) => `<p>${ esc( r.title ) } · ${ esc( r.outcome ) }</p>` ).join( '' );
	return `<header class="qj-head"><div><small class="qj-eyebrow">CAPTAIN'S LOG</small><h2>Quest Journal</h2><p>${ model.rows.length } active · Select a quest to chart your course</p></div><button type="button" class="nb-btn is-ghost" data-close aria-label="Close quest journal">Close (J)</button></header><div class="qj-layout"><nav class="qj-list" aria-label="Active quests">${ rows || '<p class="qj-note">No active quests. Speak to harbour residents or read a notice board.</p>' }</nav><section class="qj-detail" aria-label="Selected quest">${ detail }</section></div>${ offers || notes || recent ? `<details class="qj-notes"><summary>Leads, completed voyages & notes</summary>${ offers }${ notes }${ recent }</details>` : '' }`;

}

export function journalCloseKey( e ) {

	return e.code === 'Escape' || ( e.code === 'KeyJ' && ! e.repeat );

}

export class QuestJournal {

	constructor( notices, owner ) {

		this.n = notices;
		this.owner = owner;
		this._sig = '';
		if ( typeof document !== 'undefined' && ! document.getElementById( 'qj-style' ) ) {

			const style = document.createElement( 'style' ); style.id = 'qj-style'; style.textContent = CSS; document.head.append( style );

		}

	}
	get map() { return this.n.features?.get?.( 'worldmap' ); }
	render( force = false ) {

		const model = questJournalModel( this.n.app, this.n.features ), map = this.map;
		map?.reconcileQuests?.( model.rows );
		const html = questJournalHTML( model, map?.selectedQuest, map?.trackedQuest );
		if ( force || html !== this._sig ) {

			this._sig = html;
			const focused = this.owner.panel.contains?.( document.activeElement ) ? document.activeElement?.getAttribute?.( 'data-qj-select' ) : null;
			this.owner.panel.innerHTML = html;
			if ( focused ) [ ...this.owner.panel.querySelectorAll( '[data-qj-select]' ) ].find( ( e ) => e.dataset.qjSelect === focused )?.focus();

		}

	}
	click( e ) {

		const button = e.target.closest?.( '[data-qj-select],[data-qj-map],[data-qj-track]' );
		if ( ! button ) return false;
		const map = this.map;
		if ( button.hasAttribute( 'data-qj-select' ) ) map?.selectQuest?.( button.dataset.qjSelect );
		else if ( button.hasAttribute( 'data-qj-track' ) ) map?.trackQuest?.( map.selectedQuest === map.trackedQuest ? null : map.selectedQuest );
		else if ( button.hasAttribute( 'data-qj-map' ) ) {

			if ( map?.showQuest?.( map.selectedQuest ) ) this.owner.close();

		}
		this.render();
		return true;

	}

}

const CSS = `
/* (wave 24F) the journal in the HUD's own language (ui.css tokens: the glass, the type scale, aqua for the selection,
   the sun tone for eyebrows), not a third panel style beside the cooler and the world map */
.nb-panel.qj-panel { width: min(calc(820 * var(--tw-u)), calc(100vw - 2 * var(--tw-edge))); max-height: 84vh; padding: var(--tw-5) var(--tw-6); z-index: 44;
	background: linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0) 40%), var(--tw-glass); border: 1px solid var(--tw-line); border-radius: var(--tw-r-lg);
	-webkit-backdrop-filter: blur(18px) saturate(1.6); backdrop-filter: blur(18px) saturate(1.6);
	box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.07), 0 1px 2px rgba(0, 0, 0, 0.25), 0 12px 32px -12px rgba(0, 0, 0, 0.55); font-family: var(--tw-font); color: var(--tw-ink); }
.qj-head { display: flex; justify-content: space-between; gap: var(--tw-3); align-items: center; padding-bottom: var(--tw-3); border-bottom: 1px solid var(--tw-line); }
.qj-eyebrow { color: var(--tw-sun); font-size: var(--tw-fs-xs); font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase; }
.qj-head h2 { font-size: calc(17 * var(--tw-u)); margin: var(--tw-1) 0; font-weight: 600; letter-spacing: -0.01em; }
.qj-head p, .qj-note { color: var(--tw-ink-3); font-size: var(--tw-fs-sm); line-height: 1.55; margin: var(--tw-1) 0; }
.qj-head .nb-btn { font: 600 var(--tw-fs-md) var(--tw-font); color: var(--tw-ink); background: var(--tw-fill-2); border: 0; border-radius: 999px; padding: var(--tw-2) var(--tw-4); }
.qj-layout { display: grid; grid-template-columns: minmax(200px, 0.85fr) minmax(0, 1.4fr); min-height: 280px; overflow: auto; }
.qj-list { display: flex; flex-direction: column; gap: var(--tw-2); overflow: auto; padding: var(--tw-3) var(--tw-3) var(--tw-3) 0; max-height: 48vh; border-right: 1px solid var(--tw-line); }
.qj-row { appearance: none; display: flex; flex-direction: column; text-align: left; gap: 3px; border: 0; border-radius: var(--tw-r-md); padding: var(--tw-2) var(--tw-3); color: var(--tw-ink);
	background: var(--tw-fill); box-shadow: inset 0 0 0 1px var(--tw-line); cursor: pointer; font: inherit; transition: background var(--tw-fast), box-shadow var(--tw-fast); }
.qj-row:hover { background: var(--tw-fill-2); }
.qj-row:focus-visible, .qj-actions button:focus-visible { outline: 2px solid rgba(var(--tw-aqua-rgb), 0.9); outline-offset: 2px; }
.qj-row.is-selected { background: linear-gradient(180deg, rgba(var(--tw-aqua-rgb), 0.18), rgba(var(--tw-aqua-rgb), 0.06)); box-shadow: inset 0 0 0 1px rgba(var(--tw-aqua-rgb), 0.5), 0 0 18px -6px rgba(var(--tw-aqua-rgb), 0.55); }
.qj-row small { color: var(--tw-ink-3); font-size: var(--tw-fs-xs); font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; }
.qj-row b { font-size: var(--tw-fs-md); font-weight: 600; }
.qj-row span { font-size: var(--tw-fs-sm); color: var(--tw-ink-2); line-height: 1.45; }
.qj-detail { padding: var(--tw-4) var(--tw-5); min-width: 0; }
.qj-detail h3 { font-size: calc(20 * var(--tw-u)); font-weight: 600; letter-spacing: -0.01em; margin: var(--tw-2) 0 var(--tw-3); color: var(--tw-ink); }
.qj-objective { font-size: var(--tw-fs-lg); line-height: 1.6; color: var(--tw-ink-2); }
.qj-place { color: var(--tw-sun); font-size: var(--tw-fs-sm); margin-top: var(--tw-4); }
.qj-actions { display: flex; flex-wrap: wrap; gap: var(--tw-2); margin-top: var(--tw-5); }
.qj-actions button { min-height: calc(36 * var(--tw-u)); }
.qj-empty { margin: var(--tw-6) 0; color: var(--tw-ink-3); line-height: 1.6; }
.qj-empty b { color: var(--tw-ink); }
.qj-notes { border-top: 1px solid var(--tw-line); padding: var(--tw-3) 0 0; overflow: auto; font-size: var(--tw-fs-sm); color: var(--tw-ink-3); line-height: 1.55; }
.qj-notes summary { cursor: pointer; color: var(--tw-sun); }
.qj-notes p { padding: var(--tw-1) 0; }
.qj-notes b { color: var(--tw-ink); }
@media (max-width: 600px) { .nb-panel.qj-panel { padding: var(--tw-4); } .qj-layout { grid-template-columns: 1fr; } .qj-list { max-height: 24vh; border-right: 0; border-bottom: 1px solid var(--tw-line); padding-right: 0; }
	.qj-detail { padding: var(--tw-4) 2px; } .qj-detail h3 { margin: var(--tw-2) 0; } .qj-actions { margin-top: var(--tw-3); } .qj-head .nb-btn { min-height: 40px; } }
`;
