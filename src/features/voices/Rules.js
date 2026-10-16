// Voice rules (wave 26B): which line a speaker says for a moment, and when it is allowed to speak. Pure logic (injected clock
// and rng), so the tests and the feature share it.
//
//   const d = new Director( LINES, { rng } )
//   d.pick( who, kind, now ) -> line | null        a line of that speaker and kind that is not on cooldown (never the one just said)
//   d.ready( who, now )                            the global gap and the speaker's own gap have passed, nobody is mid-sentence
//   d.say( who, kind, now, { force } ) -> line | null   pick + reserve (global gap, speaker gap, line cooldown, busy until the line ends)
//
// Limits (seconds): GAP.global between any two lines, GAP.speaker per speaker, GAP.line before the same line again;
// a line blocks the others for its own length (secs) so voices never talk over each other.

export const GAP = { global: 2.2, speaker: 9, line: 75 };
// speakers that may speak more often than the default (a bark in a fight, a hail, the radio)
export const SPEAKER_GAP = { navy: 4, press: 8, police: 5, radio: 20, crew: 38, agent: 6, roid: 6, poorgoat: 5, ethena: 5, tavern: 6, hale: 8 };

export class Director {

	constructor( lines, { rng = Math.random, gaps = GAP, speakerGap = SPEAKER_GAP } = {} ) {

		this.lines = lines;
		this.rng = rng;
		this.gaps = gaps;
		this.speakerGap = speakerGap;
		this.byKey = new Map(); // `${who}/${kind}` -> [ line ]
		for ( const l of lines ) {

			const k = `${ l.who }/${ l.kind }`;
			if ( ! this.byKey.has( k ) ) this.byKey.set( k, [] );
			this.byKey.get( k ).push( l );

		}

		this.lastGlobal = - Infinity;
		this.busyUntil = - Infinity;
		this.lastBy = new Map(); // who -> time
		this.lastLine = new Map(); // id -> time
		this.lastId = new Map(); // `${who}/${kind}` -> id
		this.said = 0;
		this.refused = 0;

	}

	gapOf( who ) {

		return this.speakerGap[ who ] ?? this.gaps.speaker;

	}

	ready( who, now ) {

		if ( now < this.busyUntil ) return false;
		if ( now - this.lastGlobal < this.gaps.global ) return false;
		return now - ( this.lastBy.get( who ) ?? - Infinity ) >= this.gapOf( who );

	}

	pick( who, kind, now ) {

		const k = `${ who }/${ kind }`;
		const all = this.byKey.get( k );
		if ( ! all || ! all.length ) return null;
		let pool = all.filter( ( l ) => now - ( this.lastLine.get( l.id ) ?? - Infinity ) >= this.gaps.line );
		if ( ! pool.length ) return null;
		const last = this.lastId.get( k );
		if ( pool.length > 1 ) pool = pool.filter( ( l ) => l.id !== last );
		return pool[ Math.min( pool.length - 1, Math.floor( this.rng() * pool.length ) ) ];

	}

	// secs: the line's length (from the manifest) so the next voice waits for it
	say( who, kind, now, { force = false, secs = 2.5 } = {} ) {

		if ( ! force && ! this.ready( who, now ) ) { this.refused ++; return null; }
		const line = this.pick( who, kind, now );
		if ( ! line ) { this.refused ++; return null; }
		this.lastGlobal = now;
		this.busyUntil = now + secs;
		this.lastBy.set( who, now );
		this.lastLine.set( line.id, now );
		this.lastId.set( `${ who }/${ kind }`, line.id );
		this.said ++;
		return line;

	}

	reset() {

		this.lastGlobal = this.busyUntil = - Infinity;
		this.lastBy.clear();
		this.lastLine.clear();
		this.lastId.clear();

	}

}

// the crew line for a hand's traits: the first trait of the priority list the hand has, else null
export const CREW_TRAITS = [ 'seasick', 'drunkard', 'brave', 'sharpEyed', 'cook', 'lucky', 'lazy' ];
export function crewTraitOf( traits ) {

	const set = new Set( traits || [] );
	for ( const t of CREW_TRAITS ) if ( set.has( t ) ) return t;
	return null;

}

// the radio's forecast line for the weather kind the plane is flying into
export function radioKind( weatherKind ) {

	if ( weatherKind === 'storm' ) return 'storm';
	if ( weatherKind === 'rain' || weatherKind === 'fog' || weatherKind === 'overcast' ) return 'squall';
	return 'clear';

}

// which resident says what: the tavern keepers and the lieutenant have their own voices, anyone else a townsperson's
const TAVERN_IDS = new Set( [ 'brine', 'nell', 'tavi', 'pip' ] );
export function residentSpeaker( r, rng = Math.random ) {

	if ( ! r ) return 'townA';
	if ( r.id === 'hale' ) return 'hale';
	if ( TAVERN_IDS.has( r.id ) || r.role === 'tavern' ) return 'tavern';
	return [ 'townA', 'townB', 'townC', 'townD' ][ Math.floor( rng() * 4 ) % 4 ];

}
