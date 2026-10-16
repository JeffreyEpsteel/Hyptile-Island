// Aerobatics for the realistic rotorcraft (wave 25E): a detector that reads the airframe's body rates and attitude each
// step and names what the pilot just flew: a Backflip / Front flip (a full pitch turn about the mast's own axis, nearly
// in place), a Loop (the same at speed), a Roll / Barrel roll, a Pirouette (a full turn about the mast while airborne),
// an Inverted pass (upside down and moving for 1.5 s), a Tic-toc (the nose rocked up and down past 50 degrees three
// times in quick succession). Tricks within COMBO_GAP seconds chain a combo (x1, x1.5, x2 ...); a crash rug-pulls the
// combo. The names carry a crypto-market parody flavour (the user asked for it).
//
//   const t = new TrickDetector();   t.step( dt, flight ) -> [ { id, name, points, combo, total } ]   t.crash()   t.combo
const TAU = Math.PI * 2;
export const COMBO_GAP = 3.5;
export const TRICKS = Object.freeze( {
	backflip: { label: 'Backflip', points: 150, flavour: [ 'Diamond-hands', 'HODL', 'Buy-the-dip' ] },
	frontflip: { label: 'Front flip', points: 150, flavour: [ 'To-the-moon', 'Pump', 'Moon-boy' ] },
	loop: { label: 'Loop', points: 220, flavour: [ 'Liquidity', 'Yield-farm', 'Compound' ] },
	roll: { label: 'Roll', points: 120, flavour: [ 'Rug-pull', 'Paper-hands', 'Stop-loss' ] },
	barrel: { label: 'Barrel roll', points: 180, flavour: [ 'Bull-run', 'Whale', 'Margin-call' ] },
	pirouette: { label: 'Pirouette', points: 100, flavour: [ 'Pump-and-dump', 'Gas-fee', 'Airdrop' ] },
	inverted: { label: 'Inverted pass', points: 250, flavour: [ 'Bear-market', 'Short-squeeze', 'Upside-down chart' ] },
	tictoc: { label: 'Tic-toc', points: 300, flavour: [ 'Sideways-market', 'Volatility', 'Candle-wick' ] },
} );

export class TrickDetector {

	constructor() { this.reset(); }

	reset() {
		this.acc = { x: 0, y: 0, z: 0 }; this.idle = { x: 0, y: 0, z: 0 };
		this.invT = 0; this.invDone = false; this.swings = []; this.lastSwing = 0; this.t = 0;
		this.combo = 0; this.comboT = 0; this.comboPoints = 0; this.total = 0; this.best = this.best || 0; this.count = 0; this.log = [];
	}

	// a combo is live while the last trick is younger than COMBO_GAP
	get live() { return this.combo > 0 && this.t - this.comboT < COMBO_GAP; }

	crash() { const lost = this.live ? this.comboPoints : 0; this.combo = 0; this.comboPoints = 0; this.acc.x = this.acc.y = this.acc.z = 0; return lost; }

	_name( id ) { const d = TRICKS[ id ]; return d.flavour[ this.count % d.flavour.length ] + ' ' + d.label; }

	_award( id, out ) {
		if ( ! this.live ) { this.combo = 0; this.comboPoints = 0; }
		this.combo ++; this.comboT = this.t; this.count ++;
		const mult = 1 + 0.5 * ( this.combo - 1 ), points = Math.round( TRICKS[ id ].points * mult );
		this.comboPoints += points; this.total += points; this.best = Math.max( this.best, this.comboPoints );
		const e = { id, name: this._name( id ), points, combo: this.combo, mult, total: this.total };
		this.log.push( e ); if ( this.log.length > 20 ) this.log.shift();
		out.push( e );
	}

	// flight: { omega (body rad/s), up() (world mast), velocity, grounded, agl, mode }
	step( dt, f ) {
		const out = [];
		this.t += dt;
		if ( this.combo && ! this.live ) { this.combo = 0; this.comboPoints = 0; }
		if ( f.grounded || f.onWater || f.mode !== 'real' || ( f.agl ?? 99 ) < 1.5 ) { this.acc.x = this.acc.y = this.acc.z = 0; this.invT = 0; this.invDone = false; return out; }
		const w = f.omega, speed = Math.hypot( f.velocity.x, f.velocity.z ) + Math.abs( f.velocity.y ) * 0.5;
		for ( const k of [ 'x', 'y', 'z' ] ) {
			this.acc[ k ] += w[ k ] * dt;
			// a turn stalls out (the rate under 0.6 rad/s for 0.8 s): start counting afresh
			if ( Math.abs( w[ k ] ) < 0.6 ) { this.idle[ k ] += dt; if ( this.idle[ k ] > 0.8 ) this.acc[ k ] = 0; } else this.idle[ k ] = 0;
		}
		// pitch: + is nose down (a front flip), - nose up (a backflip); at speed it is a loop
		if ( Math.abs( this.acc.x ) >= TAU * 0.92 ) {
			this._award( speed > 14 ? 'loop' : this.acc.x < 0 ? 'backflip' : 'frontflip', out );
			this.acc.x -= Math.sign( this.acc.x ) * TAU; this.acc.z = 0; this.swings.length = 0; this.lastSwing = 0;
		}
		if ( Math.abs( this.acc.z ) >= TAU * 0.92 ) {
			this._award( speed > 14 ? 'barrel' : 'roll', out );
			this.acc.z -= Math.sign( this.acc.z ) * TAU; this.acc.x = 0;
		}
		if ( Math.abs( this.acc.y ) >= TAU * 0.95 ) { this._award( 'pirouette', out ); this.acc.y -= Math.sign( this.acc.y ) * TAU; }
		// inverted and moving
		const up = f.up();
		if ( up.y < - 0.75 && speed > 6 ) { this.invT += dt; if ( this.invT > 1.5 && ! this.invDone ) { this.invDone = true; this._award( 'inverted', out ); } }
		else if ( up.y > - 0.3 ) { this.invT = 0; this.invDone = false; }
		// tic-toc: the nose swung past +-50 degrees, alternating, within 0.9 s each
		const nose = f.forward ? f.forward().y : 0;
		const side = nose > 0.77 ? 1 : nose < - 0.77 ? - 1 : 0;
		if ( side && side !== this.lastSwing ) {
			this.swings = this.swings.filter( ( s ) => this.t - s < 2.7 );
			this.swings.push( this.t ); this.lastSwing = side;
			if ( this.swings.length >= 3 ) { this._award( 'tictoc', out ); this.swings.length = 0; this.acc.x = 0; }
		}
		return out;
	}

}
