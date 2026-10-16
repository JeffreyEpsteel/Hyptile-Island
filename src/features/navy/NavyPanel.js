// The navy office window (wave 19B): a small glass card in the HUD panels' look (the shared .gm-panel shell, the --tw-* tokens, .tw-glass), opened with E at
// the naval jetty's office or the Tidemark harbourmaster's claim: your standing, the bounties owed (claim), a fine owed (pay),
// the chandler (better cannon by standing, chain shot and powder cheaper the better it is) and the forecast at sea. The press
// gang's "invitation" uses the same card with its two answers. Built lazily the first time there is a HUD to put it in; headless
// (tests) it stays a plain object and the navy's methods decide.

const CSS = /* css */`
/* the shell, title, text, answers and close are the shared .gm-panel / .gm-act / .gm-x of ui/ui.css (wave 25B) */
.nv-panel p { margin: 0 0 var(--tw-2); color: var(--tw-ink-2); }
`;

let cssInstalled = false;
const esc = ( s ) => String( s ).replace( /[&<>"]/g, ( c ) => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } )[ c ] );

export class NavyPanel {

	constructor( navy ) {

		this.navy = navy;
		this.el = null;
		this.isOpen = false;
		this.mode = null; // 'office' | 'press'

	}

	_ensure() {

		if ( this.el ) return true;
		if ( typeof document === 'undefined' || ! document.createElement ) return false;
		const app = this.navy.app;
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
		this.el.className = 'gm-panel nv-panel tw-glass tw-interactive';
		this.el.addEventListener( 'click', ( e ) => {

			const b = e.target && e.target.closest ? e.target.closest( '[data-nv]' ) : null;
			if ( ! b || b.disabled ) return;
			const act = b.dataset.nv;
			if ( act === 'close' ) this.close();
			else if ( act === 'claim' ) this.navy.claim();
			else if ( act === 'fine' ) this.navy.payFine();
			else if ( act === 'refuse' || act === 'sign' ) this.navy.resolvePress( act );
			else if ( act.startsWith( 'buy:' ) ) this.navy.buy( act.slice( 4 ) );
			if ( this.isOpen ) this.render();

		} );
		host.append( this.el );
		return true;

	}

	open( mode = 'office' ) {

		this.mode = mode;
		this.isOpen = true;
		if ( ! this._ensure() ) return false;
		this.render();
		this.el.classList.add( 'is-open' );
		try { if ( document.pointerLockElement && document.exitPointerLock ) document.exitPointerLock(); } catch ( e ) { /* ignore */ }
		return true;

	}

	render() {

		if ( ! this.el ) return;
		const n = this.navy, v = n.view();
		if ( this.mode === 'press' && n.press ) {

			this.el.innerHTML = `
				<h2>The press gang</h2>
				<p>Four sailors and a bosun with a cudgel "invite" you to sign on for the King's service. Your navy standing is <b>${ esc( v.standingName ) }</b>; they are very keen.</p>
				<div class="gm-acts">
					<button class="gm-act" data-nv="sign">Sign on<small>Scrub the frigate's deck till sundown; the navy thinks better of you</small></button>
					<button class="gm-act" data-nv="refuse">Refuse politely<small>A fine of $${ n.press.fine } for wasting their time</small></button>
				</div>`;
			return;

		}

		const rows = n.chandlerRows().map( ( r ) => `<button class="gm-act" data-nv="buy:${ r.id }" ${ r.ok ? '' : 'disabled' }>${ esc( r.label ) } · $${ r.price }<small>${ esc( r.note ) }</small></button>` ).join( '' );
		this.el.innerHTML = `
			<button class="gm-x nv-close" data-nv="close" aria-label="Close">×</button>
			<h2>Navy office, Tidemark</h2>
			<p>Standing: <b>${ esc( v.standingName ) }</b> (${ v.standing })${ v.wanted ? ' · <b>wanted</b>' : '' }</p>
			<p>${ esc( v.forecast ) }</p>
			<div class="gm-acts">
				<button class="gm-act" data-nv="claim" ${ v.owed > 0 ? '' : 'disabled' }>Claim navy bounties · $${ v.owed }<small>${ v.owedCount } pirate${ v.owedCount === 1 ? '' : 's' } sunk for the Crown</small></button>
				${ v.fineOwed > 0 ? `<button class="gm-act" data-nv="fine">Pay the fine · $${ v.fineOwed }<small>Unpaid fines keep your name on the list</small></button>` : '' }
				${ rows }
			</div>`;

	}

	close() {

		this.isOpen = false;
		if ( this.el ) this.el.classList.remove( 'is-open' );

	}

	dispose() {

		this.close();
		if ( this.el && this.el.parentNode ) this.el.parentNode.removeChild( this.el );
		this.el = null;

	}

}
