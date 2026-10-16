// Pure selection logic of the music director (no audio, no engine): which of the six tracks fits the moment, with the
// hysteresis that keeps it from flickering. Node-testable; index.js feeds it the real game signals.
//
//   TRACKS                 name -> { file, bytes? }   (public/audio/music/<name>.ogg, lazy)
//   pick( c ) -> { track | null, level (0..1 of the music bus), why }      the rule table, no memory
//   locate( x, z, islands, prev ) -> island id | 'sea'                    inside the shore with a 12% margin before leaving
//   Selector                  the rules plus memory: debounced combat with a hold, latched night / tavern distances, a
//                             minimum stay on a track, and menu / combat that cut in at once
//
// Context c (all optional): { menu, paused, inside (interior id | null), tavernInside (bool), tavernDist (m), flying, boat,
//   island ('home' | 'meridian' | ... | 'sea'), night (0..1), combat (bool), wild (bool, not in a town) }
// Rules, in order:
//   menu                                            -> menu-theme
//   combat (navy / police chase, dogfight, naval)   -> combat
//   inside a tavern, or near one at night           -> tavern
//   Meridian after dusk (not flying)                -> meridian-night
//   flying or at sea                                -> sailing (a little lower at night)
//   an island by day                                -> island-day
//   an island by night away from a tavern           -> silence ("quiet by night in the wild")

export const TRACKS = {
	'menu-theme': { file: 'menu-theme.ogg', secs: 90 },
	'island-day': { file: 'island-day.ogg', secs: 120 },
	tavern: { file: 'tavern.ogg', secs: 90 },
	sailing: { file: 'sailing.ogg', secs: 120 },
	combat: { file: 'combat.ogg', secs: 90 },
	'meridian-night': { file: 'meridian-night.ogg', secs: 120 },
};
export const TRACK_NAMES = Object.keys( TRACKS );

export const TUNE = {
	combatEnter: 0.6, // s a combat signal must last before the track changes (a single stray shot is not a fight)
	combatHold: 16, // s the combat track stays after the last signal
	dwell: 8, // s a calm track stays before another calm track replaces it
	settle: 1.5, // s a new calm choice must be stable before it is taken
	nightOn: 0.55, nightOff: 0.4, // wild night: silence latch (night factor)
	duskOn: 0.3, duskOff: 0.18, // Meridian's night track (dusk counts)
	tavernNear: 22, tavernFar: 32, // m, near a tavern at night
	shore: 1.12, // an island is left at 112% of its radius
	nightSea: 0.75, // sailing level at night
	pausedLevel: 0.55, // the pause menu is up
};

export function locate( x, z, islands, prev = 'sea' ) {

	let best = null, bestR = Infinity;
	for ( const i of islands || [] ) {

		if ( ! i || ! i.center ) continue;
		const r = Math.hypot( x - i.center.x, z - ( i.center.z !== undefined ? i.center.z : i.center.y ) ) / ( i.radius || 1 );
		const lim = i.id === prev ? TUNE.shore : 1;
		if ( r < lim && r < bestR ) { best = i.id; bestR = r; }

	}

	return best || 'sea';

}

export function pick( c = {} ) {

	if ( c.menu ) return { track: 'menu-theme', level: 1, why: 'menu' };
	const pause = c.paused ? TUNE.pausedLevel : 1;
	if ( c.combat ) return { track: 'combat', level: pause, why: 'combat' };
	if ( c.tavernInside || ( c.tavernNear && c.night ) ) return { track: 'tavern', level: pause, why: c.tavernInside ? 'tavern-inside' : 'tavern-near' };
	if ( c.island === 'meridian' && ! c.flying && c.dusk ) return { track: 'meridian-night', level: pause, why: 'meridian-night' };
	if ( c.flying || c.boat || c.island === 'sea' ) return { track: 'sailing', level: pause * ( c.night ? TUNE.nightSea : 1 ), why: c.flying ? 'flying' : 'sea' };
	if ( ! c.night ) return { track: 'island-day', level: pause, why: 'island-day' };
	return { track: null, level: 0, why: 'quiet-night' };

}

export class Selector {

	constructor( tune = {} ) {

		this.tune = { ...TUNE, ...tune };
		this.t = 0;
		this.current = null; // { track, level, why } in force
		this.since = - 1e9; // time the current track started
		this.combatSince = null; // first time of the running combat signal
		this.engaged = false; // the fight is on (debounced in, held out)
		this.combatLast = - 1e9; // last time of a combat signal
		this.night = false; this.dusk = false; this.near = false;
		this.cand = null; this.candSince = 0;
		this.changes = 0;

	}

	reset() {

		this.current = null; this.since = - 1e9; this.combatSince = null; this.combatLast = - 1e9; this.engaged = false;
		this.night = this.dusk = this.near = false; this.cand = null;

	}

	step( c, dt ) {

		const tu = this.tune;
		this.t += Math.max( 0, dt || 0 );
		const t = this.t;
		const n = Number.isFinite( c.night ) ? c.night : 0;
		this.night = this.night ? n > tu.nightOff : n >= tu.nightOn;
		this.dusk = this.dusk ? n > tu.duskOff : n >= tu.duskOn;
		const d = Number.isFinite( c.tavernDist ) ? c.tavernDist : Infinity;
		this.near = this.near ? d < tu.tavernFar : d < tu.tavernNear;

		// combat: the signal must last combatEnter seconds to engage, then it is held combatHold seconds after the last one
		if ( c.combat ) {

			if ( this.combatSince === null ) this.combatSince = t;
			this.combatLast = t;
			if ( ! this.engaged && t - this.combatSince >= tu.combatEnter ) this.engaged = true;

		} else if ( this.engaged ) {

			if ( t - this.combatLast > tu.combatHold ) { this.engaged = false; this.combatSince = null; }

		} else if ( this.combatSince !== null && t - this.combatLast > 0.5 ) this.combatSince = null; // a gap restarts the debounce
		const fighting = this.engaged;

		const want = pick( { ...c, night: this.night, dusk: this.dusk, tavernNear: this.near, combat: fighting && ! c.menu } );
		const cur = this.current;
		if ( ! cur ) return this._take( want, t );
		// the level follows at once; the track changes by the rules
		if ( want.track === cur.track ) { cur.level = want.level; cur.why = want.why; this.cand = null; return cur; }
		if ( want.track === 'menu-theme' || want.track === 'combat' ) return this._take( want, t );
		if ( cur.track === 'combat' && fighting ) return cur;
		if ( this.cand !== want.track ) { this.cand = want.track; this.candSince = t; }
		const stable = t - this.candSince >= tu.settle;
		const stayed = t - this.since >= tu.dwell || cur.track === 'menu-theme' || cur.track === 'combat' || cur.track === null;
		if ( stable && stayed ) return this._take( want, t );
		cur.level = cur.track === null ? 0 : cur.level;
		return cur;

	}

	_take( want, t ) {

		this.current = { ...want };
		this.since = t;
		this.cand = null;
		this.changes ++;
		return this.current;

	}

}
