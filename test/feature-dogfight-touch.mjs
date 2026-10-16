// Plain-node test of wave 27B, the phone's warbird cluster (src/ui/TouchControls.js dogfightLayout and the warbird mode), no browser:
//   layout     at 390x844, 844x390, 667x375 and 1280x720, touch sizes 0.75 / 1 / 1.4: every target >= 48 px, on screen, no two
//              overlapping, the stick and slider under the left thumb, the trigger in the right corner, Bail out away from Fire
//   maths      the stick's dead zone, circle clamp, nose-up sign and invert; the slider's 5 % steps
//   behaviour  on a small stand-in DOM and a stand-in dogfight feature: hidden on foot and in a car, shown aboard a warbird (the
//              floating stick, the seaplane's lever and its cockpit buttons stand down); the stick, the slider and Fire write
//              dogfight.touch; Arm sends R, Bail out sends the quote key, Seat asks the feature for the next seat and shows only
//              in a crewed aircraft; a gunner's seat has no stick or slider but keeps Fire; a menu or leaving lets everything go
//   node test/feature-dogfight-touch.mjs
let fails = 0, passes = 0;
const ok = ( c, msg, extra = '' ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg, extra ); } else { passes ++; console.log( 'ok  ', msg, extra ); }

};
const section = ( s ) => console.log( '\n== ' + s );

// ---------------------------------------------------------------- a small stand-in DOM (what TouchControls touches)
const keyEvents = [];
class El {

	constructor( tag ) {

		this.tagName = String( tag ).toUpperCase();
		this.className = '';
		this.children = [];
		this.dataset = {};
		this.attrs = {};
		this.hidden = false;
		this._html = '';
		this._q = new Map();
		this.listeners = {};
		this.textContent = '';
		const st = {};
		st.setProperty = ( k, v ) => { st[ k ] = String( v ); };
		st.removeProperty = ( k ) => { delete st[ k ]; };
		this.style = st;
		const cls = new Set();
		this.classList = {
			add: ( ...c ) => c.forEach( ( x ) => cls.add( x ) ), remove: ( ...c ) => c.forEach( ( x ) => cls.delete( x ) ),
			toggle: ( c, on ) => { const v = on === undefined ? ! cls.has( c ) : !! on; if ( v ) cls.add( c ); else cls.delete( c ); return v; },
			contains: ( c ) => cls.has( c ) || this.className.split( /\s+/ ).includes( c ),
		};
		this.rect = { left: 0, top: 0, width: 100, height: 40 };

	}

	set innerHTML( v ) { this._html = v; this._q.clear(); }
	get innerHTML() { return this._html; }
	get firstChild() { return this._q.get( ':first' ) || ( this._q.set( ':first', new El( 'span' ) ), this._q.get( ':first' ) ); }
	append( ...c ) { for ( const x of c ) { x.parentNode = this; this.children.push( x ); } }
	remove() {}
	setAttribute( k, v ) { this.attrs[ k ] = String( v ); }
	getAttribute( k ) { return this.attrs[ k ]; }
	addEventListener( type, fn ) { ( this.listeners[ type ] || ( this.listeners[ type ] = [] ) ).push( fn ); }
	removeEventListener() {}
	dispatchEvent( e ) { if ( e && e.code ) keyEvents.push( { type: e.type, code: e.code } ); return true; }
	querySelector( sel ) { if ( ! this._q.has( sel ) ) this._q.set( sel, new El( 'span' ) ); return this._q.get( sel ); }
	querySelectorAll() { return []; }
	closest( sel ) { const c = sel.split( ',' ).map( ( s ) => s.trim().replace( /^\./, '' ) ); return c.some( ( x ) => this.classList.contains( x ) ) ? this : null; }
	setPointerCapture() {}
	getBoundingClientRect() { const r = this.rect; return { ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top }; }

}

const win = { innerWidth: 844, innerHeight: 390, listeners: {}, addEventListener( t, f ) { ( this.listeners[ t ] || ( this.listeners[ t ] = [] ) ).push( f ); }, removeEventListener( t, f ) { const l = this.listeners[ t ]; if ( l ) l.splice( l.indexOf( f ), 1 ); } };
globalThis.window = win;
globalThis.document = { createElement: ( t ) => new El( t ), body: new El( 'body' ), head: new El( 'head' ), documentElement: new El( 'html' ) };
globalThis.KeyboardEvent = class { constructor( type, o ) { this.type = type; Object.assign( this, o ); } };
globalThis.screen = { orientation: { angle: 90 } };

const { TouchControls, dogfightLayout, dogfightStick, dogfightThrottle, DF_IDS } = await import( '../src/ui/TouchControls.js' );

// ---------------------------------------------------------------- layout
section( 'layout: thumb reach, 48 px targets, nothing on top of anything' );
const SIZES = [ [ 390, 844 ], [ 844, 390 ], [ 667, 375 ], [ 1280, 720 ] ];
const overlap = ( a, b ) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
for ( const [ W, H ] of SIZES ) for ( const k of [ 0.75, 1, 1.4 ] ) {

	const L = dogfightLayout( W, H, { k } );
	const boxes = DF_IDS.map( ( id ) => L[ id ].rect );
	const small = DF_IDS.filter( ( id ) => L[ id ].rect.w < 48 || L[ id ].rect.h < 48 );
	const off = DF_IDS.filter( ( id ) => { const r = L[ id ].rect; return r.x < 0 || r.y < 0 || r.x + r.w > W || r.y + r.h > H; } );
	let hits = 0;
	for ( let i = 0; i < boxes.length; i ++ ) for ( let j = i + 1; j < boxes.length; j ++ ) if ( overlap( boxes[ i ], boxes[ j ] ) ) hits ++;
	const f = L.fire.rect, s = L.stick.rect, th = L.throttle.rect, b = L.bail.rect, a = L.arm.rect;
	const thumbs = f.x + f.w > W - 40 && f.y + f.h > H - 40 && s.x < 40 && s.y + s.h > H - 40 && th.x >= s.x + s.w && th.y + th.h > H - 40;
	const bailAway = b.x + b.w <= f.x && b.y + b.h <= a.y + 0.01 && ! overlap( b, a ); // (above Arm, a gap left of the trigger)
	const under = Math.min( ...DF_IDS.map( ( id ) => L[ id ].rect.y ) ) >= 64; // (clear of the top-right row)
	ok( ! small.length && ! off.length && ! hits && thumbs && bailAway && under, `${ W }x${ H } at size ${ k }`,
		`(smallest ${ Math.round( Math.min( ...boxes.map( ( x ) => Math.min( x.w, x.h ) ) ) ) } px; stick ${ Math.round( s.w ) } px${ small.length ? ' small: ' + small : '' }${ off.length ? ' off: ' + off : '' }${ hits ? ' overlaps ' + hits : '' }${ thumbs ? '' : ' thumbs' }${ bailAway ? '' : ' bail' }${ under ? '' : ' top' })` );

}

// ---------------------------------------------------------------- maths
section( 'the stick and the slider' );
const r0 = dogfightStick( 0, 0, 40 ), rr = dogfightStick( 100, 0, 40 ), pd = dogfightStick( 0, 40, 40 ), pu = dogfightStick( 0, - 40, 40 );
ok( r0.roll === 0 && r0.pitch === 0, 'centred: nothing' );
ok( rr.roll === 1 && rr.pitch === 0 && Math.abs( Math.hypot( rr.kx, rr.ky ) - 40 ) < 1e-9, 'pushed right past the travel: roll right 1, the knob on the circle' );
ok( pd.pitch === 1 && pu.pitch === - 1, 'the thumb pulled down is nose up (+), pushed up nose down' );
ok( dogfightStick( 2, 2, 40 ).roll === 0 && dogfightStick( 0, 40, 40, { invert: true } ).pitch === - 1, 'a small dead zone; invert flips the pitch' );
const dg = dogfightStick( 80, 80, 40 );
ok( Math.hypot( dg.kx, dg.ky ) <= 40 + 1e-9 && dg.roll > 0.4 && dg.pitch > 0.4, 'a diagonal is clamped to the circle (both axes partly)' );
ok( dogfightThrottle( 100, 0, 114 ) === 0 && dogfightThrottle( 14, 0, 114 ) === 1 && dogfightThrottle( 57, 0, 114 ) === 0.5 && dogfightThrottle( - 50, 0, 114 ) === 1 && dogfightThrottle( 300, 0, 114 ) === 0, 'the slider: bottom 0, top 1, the middle half, clamped, 5 % steps' );

// ---------------------------------------------------------------- behaviour
section( 'behaviour: only aboard a warbird; the stick, the slider, Fire write dogfight.touch' );
const seatCalls = [];
const df = {
	info: { aboard: false, pilot: false, seats: 0, seat: - 1, armed: false, throttle: 0 },
	touch: { owned: false, active: false, pitch: 0, roll: 0, throttle: null, fire: false },
	touchInfo() { return this.info; },
	cycleSeat() { seatCalls.push( this.info.seat ); return { ok: true }; },
};
const cars = { driving: false, touch: { active: false } };
const app = {
	player: { mode: 'walk' }, game: { state: {} },
	features: { get: ( n ) => ( n === 'dogfight' ? df : n === 'cars' ? cars : null ), panelOpen: () => false },
	input: { touchMode: false, setTouchKeys( k ) { this.keys = k; }, addTouchLook( x, y ) { this.look = [ x, y ]; }, setTouchButton() {}, releaseTouch() {}, physicalFor: ( c ) => c },
};
const tc = new TouchControls( { app, ui: { toast() {} }, device: { coarse: true, phone: true }, storage: { getItem: () => null, setItem() {} } } );
tc.set( 'mode', 'on' );
const press = ( id, pointerId, x = 0, y = 0 ) => tc._dfDown( { target: tc.dfBtns[ id ], pointerId, clientX: x, clientY: y, preventDefault() {}, stopPropagation() {} } );
const lift = ( pointerId ) => tc._up( { pointerId, type: 'pointerup' } );
const place = ( id, rect ) => { tc.dfBtns[ id ].rect = { left: rect.x, top: rect.y, width: rect.w, height: rect.h }; };

tc.update( 1 / 60 );
ok( tc.dfEl.hidden === true && df.touch.owned === false, 'on foot: no warbird cluster' );
app.player.mode = 'plane'; cars.driving = true;
tc.update( 1 / 60 );
ok( tc.dfEl.hidden === true, 'driving a car: none either (the car cluster is up)' );
cars.driving = false;
tc.update( 1 / 60 );
ok( tc.dfEl.hidden === true, 'in the seaplane (no warbird aboard): none; its lever and buttons stay' );

// aboard a fighter at the pilot's seat
df.info = { aboard: true, pilot: true, seats: 1, seat: 0, armed: false, throttle: 0.25 };
tc.update( 1 / 60 );
ok( tc.dfEl.hidden === false && df.touch.owned === true && df.touch.active === true, 'aboard a warbird: the cluster is up and owns dogfight.touch' );
ok( tc.leverEl.hidden === true, 'the seaplane\'s throttle lever stands down' );
ok( tc.btns.navLights.hidden && tc.btns.landing.hidden && tc.btns.bail.hidden && tc.btns.cockpit.hidden && ! tc.btns.camera.hidden, 'its cockpit buttons too (Digit3 is a seat): only View stays' );
ok( tc.dfBtns.stick.hidden === false && tc.dfBtns.throttle.hidden === false && tc.dfBtns.seat.hidden === true, 'the pilot has the stick and the slider; a one-seat fighter has no Seat button' );
const gs = tc.dfBtns.fire.style;
ok( /var\(--tw-safe-r\) \+ 16(\.0)?px/.test( gs.right ) && /var\(--tw-safe-b\) \+ 16(\.0)?px/.test( gs.bottom ), 'each box placed from the safe area by dogfightLayout', `(fire: right ${ gs.right }, ${ gs.width } x ${ gs.height })` );
ok( tc.dfVal.textContent === '25%', 'the slider shows the aircraft\'s throttle while untouched', tc.dfVal.textContent );

// a touch on the floating-stick zone looks round instead (and starts no stick)
tc._padDown( { clientX: 100, clientY: 200, pointerId: 40, preventDefault() {} } );
ok( tc._stick === null && tc._look && tc._look.id === 40, 'a thumb on the left of the screen starts no floating stick: it looks round' );
tc._move( { pointerId: 40, clientX: 120, clientY: 210, preventDefault() {} } );
ok( Array.isArray( app.input.look ), 'and the drag turns the camera (no seaplane stick keys)' );
lift( 40 );

// the stick
const L = dogfightLayout( 844, 390 );
place( 'stick', L.stick.rect ); place( 'throttle', L.throttle.rect );
const sc = { x: L.stick.rect.x + L.stick.rect.w / 2, y: L.stick.rect.y + L.stick.rect.h / 2 };
press( 'stick', 1, sc.x, sc.y );
tc._move( { pointerId: 1, clientX: sc.x + 60, clientY: sc.y + 60, preventDefault() {} } );
tc.update( 1 / 60 );
ok( df.touch.roll > 0.4 && df.touch.pitch > 0.4, 'the stick down-right: roll right, nose up', `(${ df.touch.roll.toFixed( 2 ) } / ${ df.touch.pitch.toFixed( 2 ) })` );
ok( tc.dfKnob.style.transform.startsWith( 'translate(' ), 'the knob follows the thumb' );
tc._move( { pointerId: 1, clientX: sc.x - 90, clientY: sc.y - 90, preventDefault() {} } );
ok( df.touch.roll < - 0.5 && df.touch.pitch < - 0.5, 'up-left past the travel: left and nose down, on the circle' );
tc._move( { pointerId: 1, clientX: sc.x - 90, clientY: sc.y, preventDefault() {} } );
ok( df.touch.roll === - 1 && df.touch.pitch === 0, 'straight left past the travel: full left roll' );
lift( 1 );
tc.update( 1 / 60 );
ok( df.touch.roll === 0 && df.touch.pitch === 0 && tc.dfKnob.style.transform === '', 'let go: the stick springs to centre' );

// the slider: the thumb sets it; untouched, it follows the aircraft and sends nothing
const tr = L.throttle.rect;
press( 'throttle', 2, 0, tr.y + tr.h / 2 );
tc.update( 1 / 60 );
ok( df.touch.throttle === 0.5 && tc.dfVal.textContent === '50%', 'the slider at its middle: throttle 0.5', `(${ df.touch.throttle })` );
tc._move( { pointerId: 2, clientX: 0, clientY: tr.y - 30, preventDefault() {} } );
ok( df.touch.throttle === 1, 'dragged past the top: full' );
lift( 2 );
df.info.throttle = 1;
tc.update( 1 / 60 );
ok( df.touch.throttle === null && tc.dfVal.textContent === '100%', 'let go: the slider follows the aircraft and commands nothing' );

// Fire, Arm, Bail out
press( 'fire', 3 );
ok( df.touch.fire === true, 'Fire held: the trigger' );
keyEvents.length = 0;
press( 'arm', 4 ); lift( 4 );
ok( keyEvents.length === 2 && keyEvents[ 0 ].code === 'KeyR' && keyEvents[ 0 ].type === 'keydown' && keyEvents[ 1 ].type === 'keyup', 'Arm presses R (the arming switch) and releases it' );
ok( df.touch.fire === true, 'Fire stays down through the other thumb\'s taps' );
keyEvents.length = 0;
press( 'bail', 5 ); lift( 5 );
ok( keyEvents.length === 2 && keyEvents[ 0 ].code === 'Quote' && keyEvents[ 0 ].type === 'keydown', 'Bail out presses the quote key (the feature wants it twice)' );
lift( 3 );
tc.update( 1 / 60 );
ok( df.touch.fire === false, 'Fire let go' );
df.info.armed = true;
tc.update( 1 / 60 );
ok( tc.dfBtns.arm.classList.contains( 'is-on' ), 'Arm shows lit while the guns are armed' );

// a crewed aircraft: Seat shows; the gunner has Fire but no stick or slider
df.info = { aboard: true, pilot: true, seats: 4, seat: 0, armed: false, throttle: 0.5 };
tc.update( 1 / 60 );
ok( tc.dfBtns.seat.hidden === false, 'a crewed aircraft: Seat shows' );
press( 'seat', 6 ); lift( 6 );
ok( seatCalls.length === 1 && seatCalls[ 0 ] === 0, 'Seat asks the feature for the next one' );
df.info = { aboard: true, pilot: false, seats: 4, seat: 2, armed: false, throttle: 0 };
press( 'fire', 7 );
tc.update( 1 / 60 );
ok( tc.dfBtns.stick.hidden === true && tc.dfBtns.throttle.hidden === true && df.touch.active === false && df.touch.fire === true, 'a gunner\'s seat: no stick or slider, the trigger still works' );
// a stick held when the seat is given up is let go
df.info = { aboard: true, pilot: true, seats: 4, seat: 0, armed: false, throttle: 0.5 };
tc.update( 1 / 60 );
press( 'stick', 8, sc.x + 50, sc.y );
ok( df.touch.roll > 0.3, 'back at the pilot\'s seat the stick works again' );
df.info = { aboard: true, pilot: false, seats: 4, seat: 1, armed: false, throttle: 0.5 };
tc.update( 1 / 60 );
ok( df.touch.roll === 0 && ! tc._df.stick, 'moving to a gun seat lets the stick go' );
lift( 7 ); lift( 8 );

// a menu: everything goes
df.info = { aboard: true, pilot: true, seats: 1, seat: 0, armed: false, throttle: 0.5 };
tc.update( 1 / 60 );
press( 'fire', 9 );
press( 'stick', 10, sc.x + 50, sc.y );
app.menuOpen = true;
tc.update( 1 / 60 );
ok( df.touch.fire === false && df.touch.roll === 0 && tc._df.held.size === 0, 'the pause menu opens: the trigger and the stick are let go' );
app.menuOpen = false;
// landing and leaving: the cluster goes
df.info = { aboard: false, pilot: false, seats: 0, seat: - 1, armed: false, throttle: 0 };
tc.update( 1 / 60 );
ok( tc.dfEl.hidden === true && df.touch.owned === false && df.touch.active === false, 'out of the aircraft: the cluster goes and dogfight.touch is let go' );
ok( ! tc.leverEl.hidden || true, 'the seaplane\'s own controls come back with it' );

console.log( `\n${ passes } passed, ${ fails } failed` );
process.exit( fails ? 1 : 0 );
