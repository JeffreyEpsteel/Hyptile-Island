// Wave 24E: the towns' occasions by the island calendar (plain logic: every client sharing the clock and the weather's
// day count sees the same ones). A market day fills the stalls in the morning; a festival night strings lanterns over the
// market square and the town dances; a wedding procession winds through the streets in the afternoon; a regatta races
// dinghies round the bay while the quay watches. Sandbox / tests / captures may force one for a while.
//
//   const cal = new Calendar();
//   cal.at( townId, day, hour ) -> { market, festival, regatta, procession }   (procession: the hour it sets off, else false)
//   cal.force( kind, townId, seconds ); cal.tick( dt )

export const EVENT_KINDS = [ 'market', 'festival', 'procession', 'regatta' ];

const MOD = ( d, m ) => ( ( d % m ) + m ) % m;

// which towns keep which, on which days (day: the weather's island day count) and hours
const RULES = {
	home: { market: ( d ) => MOD( d, 3 ) === 1, procession: ( d ) => MOD( d, 5 ) === 3 ? 11 : false },
	tidemark: {
		market: ( d ) => MOD( d, 3 ) === 0,
		festival: ( d, h ) => MOD( d, 4 ) === 2 && h >= 19.5 && h < 23.5,
		procession: ( d ) => MOD( d, 5 ) === 1 ? 16 : false,
		regatta: ( d, h ) => MOD( d, 4 ) === 0 && h >= 15 && h < 16.6,
	},
	meridian: { market: ( d ) => MOD( d, 2 ) === 0, festival: ( d, h ) => MOD( d, 4 ) === 0 && h >= 20 && h < 23.5 },
	blackwater: { festival: ( d, h ) => MOD( d, 7 ) === 5 && ( h >= 21 || h < 2 ) }, // a pirates' carouse round the fire
};

export class Calendar {

	constructor() {

		this.forced = []; // { kind, town, t }

	}

	force( kind, town, seconds = 300 ) {

		if ( ! EVENT_KINDS.includes( kind ) ) return false;
		this.forced = this.forced.filter( ( f ) => ! ( f.kind === kind && f.town === town ) );
		this.forced.push( { kind, town, t: seconds, fresh: true } );
		return true;

	}

	forcedOn( kind, town ) {

		return this.forced.some( ( f ) => f.kind === kind && f.town === town && f.t > 0 );

	}

	tick( dt ) {

		for ( const f of this.forced ) f.t -= dt;
		this.forced = this.forced.filter( ( f ) => f.t > 0 );

	}

	at( town, day = 0, hour = 12 ) {

		const R = RULES[ town ] || {};
		const h = ( ( hour % 24 ) + 24 ) % 24;
		const d = Math.floor( day ) || 0;
		return {
			market: this.forcedOn( 'market', town ) || ( !! R.market && R.market( d ) && h >= 7 && h < 14 ),
			festival: this.forcedOn( 'festival', town ) || ( !! R.festival && R.festival( d, h ) ),
			regatta: this.forcedOn( 'regatta', town ) || ( !! R.regatta && R.regatta( d, h ) ),
			procession: R.procession ? R.procession( d ) : false,
		};

	}

}
