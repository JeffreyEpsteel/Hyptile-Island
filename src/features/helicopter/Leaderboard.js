// The helicopter's stunt board (wave 27B): a saved, local leaderboard of the aerobatics Tricks.js names. Per trick the best
// single award and the best combo (the chain's points when that trick closed it, and how long the chain ran); overall the
// five best combos and a rank title with the market parody the tricks themselves carry. A combo that ends in a crash is
// rug-pulled: struck from the board, like its points. Nothing here touches the flight; Helicopter.js feeds it.
//
//   const b = new StuntBoard();
//   b.award( trick, comboPoints ) -> { record, chainRecord, best }   trick: a TrickDetector award { id, points, combo }
//   b.endChain( crashed )            the chain closed (its time ran out) or, crashed, was rug-pulled
//   b.best( id )   b.rows()   b.top   b.bestCombo   b.title()   b.pauseStats()   b.toJSON()   b.fromJSON( data )   b.seed( points )
import { TRICKS } from './Tricks.js';

export const TOP_N = 5;
const CAP = 9999999;
// rank titles by the best combo (points), in the crypto-market parody of the trick names
export const TITLES = Object.freeze( [
	[ 0, 'Paper Hands' ], [ 250, 'Retail Pilot' ], [ 600, 'Swing Trader' ], [ 1200, 'Diamond Hands' ],
	[ 2400, 'Whale' ], [ 4800, 'Market Maker' ], [ 9000, 'Satoshi of the Skies' ],
] );

export function stuntTitle( points ) {

	let out = TITLES[ 0 ][ 1 ];
	for ( const [ min, name ] of TITLES ) if ( points >= min ) out = name;
	return out;

}

const num = ( v ) => ( Number.isFinite( v ) ? Math.max( 0, Math.min( CAP, Math.floor( v ) ) ) : 0 );

export class StuntBoard {

	constructor() { this.reset(); }

	reset() {

		this.tricks = {}; // id -> { points, combo, chain, n }
		this.top = []; // [ { points, count, ids: [ id ] } ], best first
		this.cur = null; // the live chain's entry (also in top)

	}

	get bestCombo() { return this.top.length ? this.top[ 0 ].points : 0; }

	best( id ) { return this.tricks[ id ] ? this.tricks[ id ].points : 0; }

	title() { return stuntTitle( this.bestCombo ); }

	// trick: { id, points, combo (the chain's count with this one) }; comboPoints: the chain's points so far
	award( trick, comboPoints ) {

		const id = trick && trick.id;
		if ( ! TRICKS[ id ] ) return { record: false, chainRecord: false, best: 0 };
		const points = num( trick.points ), total = num( comboPoints ), count = num( trick.combo );
		const r = this.tricks[ id ] || ( this.tricks[ id ] = { points: 0, combo: 0, chain: 0, n: 0 } );
		const record = points > r.points;
		if ( record ) r.points = points;
		r.n ++;
		r.combo = Math.max( r.combo, total );
		r.chain = Math.max( r.chain, count );
		// the chain: a new entry at its first trick, the same entry after
		const before = this.bestCombo;
		if ( ! this.cur || count <= 1 ) {

			this.cur = { points: 0, count: 0, ids: [] };
			this.top.push( this.cur );

		}

		this.cur.points = total; this.cur.count = count; this.cur.ids.push( id );
		if ( this.cur.ids.length > 8 ) this.cur.ids.shift();
		this._sort();
		return { record, chainRecord: total > before && count > 1 && this.top[ 0 ] === this.cur, best: r.points };

	}

	endChain( crashed = false ) {

		if ( this.cur && crashed ) this.top = this.top.filter( ( e ) => e !== this.cur );
		this.cur = null;
		this._sort();

	}

	_sort() {

		this.top.sort( ( a, b ) => b.points - a.points );
		// (the live chain stays even when it is not yet among the best: it may yet climb)
		if ( this.top.length > TOP_N ) this.top = this.top.filter( ( e, i ) => i < TOP_N || e === this.cur );

	}

	// the flown tricks in TRICKS order: [ { id, label, points, combo, chain, n } ]
	rows() {

		return Object.keys( TRICKS ).filter( ( id ) => this.tricks[ id ] && this.tricks[ id ].n ).map( ( id ) => ( { id, label: TRICKS[ id ].label, ...this.tricks[ id ] } ) );

	}

	// an older save knew only its best combo: it becomes the board's first line
	seed( points ) {

		points = num( points );
		if ( points > 0 && ! this.top.length ) this.top.push( { points, count: 0, ids: [] } );

	}

	// for the pause menu's stats: null until a trick has been flown
	pauseStats() {

		const rows = this.rows();
		if ( ! rows.length && ! this.top.length ) return null;
		return {
			title: 'Helicopter stunts',
			rank: this.title(),
			best: this.bestCombo,
			tricks: rows.map( ( r ) => ( { label: r.label, points: r.points, combo: r.combo } ) ),
			top: this.top.slice( 0, 3 ).map( ( e ) => ( { points: e.points, count: e.count } ) ),
		};

	}

	toJSON() {

		const tricks = {};
		for ( const id of Object.keys( this.tricks ) ) tricks[ id ] = { ...this.tricks[ id ] };
		return { v: 1, tricks, top: this.top.map( ( e ) => ( { points: e.points, count: e.count, ids: e.ids.slice() } ) ) };

	}

	fromJSON( d ) {

		this.reset();
		if ( ! d || typeof d !== 'object' ) return;
		if ( d.tricks && typeof d.tricks === 'object' ) {

			for ( const id of Object.keys( TRICKS ) ) {

				const r = d.tricks[ id ];
				if ( ! r || typeof r !== 'object' ) continue;
				const n = num( r.n );
				if ( ! n && ! num( r.points ) ) continue;
				this.tricks[ id ] = { points: num( r.points ), combo: num( r.combo ), chain: num( r.chain ), n };

			}

		}

		if ( Array.isArray( d.top ) ) {

			for ( const e of d.top.slice( 0, TOP_N ) ) {

				if ( ! e || typeof e !== 'object' || ! num( e.points ) ) continue;
				this.top.push( { points: num( e.points ), count: num( e.count ), ids: Array.isArray( e.ids ) ? e.ids.filter( ( id ) => TRICKS[ id ] ).slice( - 8 ) : [] } );

			}

		}

		this._sort();

	}

}
