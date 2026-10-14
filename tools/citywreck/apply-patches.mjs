// Wave 21C: the root-applied patches that wire the destructible city (src/features/citywreck) into files other workers own.
// Each is an exact anchor -> replacement; an anchor must occur exactly once (else that file is left alone and named).
// Re-running is safe: a patch whose replacement is already there is skipped.
//
//   node tools/citywreck/apply-patches.mjs [--root=<a copy of the tree>] [--dry]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const arg = ( k, d = null ) => {

	const a = process.argv.find( ( x ) => x.startsWith( '--' + k + '=' ) );
	return a ? a.slice( k.length + 3 ) : d;

};
const root = resolve( arg( 'root', join( import.meta.dirname, '..', '..' ) ) );
const dry = process.argv.includes( '--dry' );

export const PATCHES = {
	// root: the module in the game
	'src/features/install.js': [
		[ "import * as interiors from '../world/interiors/index.js';\n",
			"import * as interiors from '../world/interiors/index.js';\nimport * as citywreck from './citywreck/index.js';\n" ],
		[ "\t[ 'navy', navy ], // wave 19B: Tidemark's frigate and cutters, hails, navy bounties and standing, sea events\n",
			"\t[ 'navy', navy ], // wave 19B: Tidemark's frigate and cutters, hails, navy bounties and standing, sea events\n\t[ 'citywreck', citywreck ], // wave 21C: Meridian's destructible buildings (finds app.meridian / app.ports.meridian itself)\n" ],
	],
	// root: the event vocabulary
	'src/features/Features.js': [
		[ "manOverboardRescued; world events navyWanted / navyHail   (weather) frontArrived lightningStrike\n",
			"manOverboardRescued; world events navyWanted / navyHail   (weather) frontArrived lightningStrike\n//   (citywreck, wave 21C) buildingDamaged buildingCollapsed buildingDestroyed buildingRespawned buildingRepaired cityFire cityFireCall cityCrew\n//   cityFireSpread cityRepair roadBlocked { id, edges, x, z, radius } roadCleared cityDebris cityMood cityWanted { level } towerMarked; firePool { id, x, y, z, by }\n//   (weapons); world event cityStages (host -> all); hostRequest cityHit / citySnap\n" ],
	],
	// naval: cannonballs stop on Meridian's buildings (a direct hit names the building)
	'src/features/naval/Naval.js': [
		[ "\t\tconst de = this.features && this.features.get ? this.features.get( 'destruction' ) : null;\n\t\tthis._ctx.raycastProps = de && typeof de.raycastSegment === 'function'\n\t\t\t? ( a, b ) => {\n\n\t\t\t\ttry {\n\n\t\t\t\t\treturn de.raycastSegment( a.x, a.y, a.z, b.x, b.y, b.z );\n\n\t\t\t\t} catch ( e ) {\n\n\t\t\t\t\treturn null;\n\n\t\t\t\t}\n\n\t\t\t}\n\t\t\t: null;\n",
			"\t\tconst de = this.features && this.features.get ? this.features.get( 'destruction' ) : null;\n\t\t// (wave 21C) and Meridian's buildings: the nearer of the two\n\t\tconst cw = this.features && this.features.get ? this.features.get( 'citywreck' ) : null;\n\t\tconst rays = [ de, cw ].filter( ( f ) => f && typeof f.raycastSegment === 'function' );\n\t\tthis._ctx.raycastProps = rays.length\n\t\t\t? ( a, b ) => {\n\n\t\t\t\tlet best = null;\n\t\t\t\tfor ( const f of rays ) {\n\n\t\t\t\t\tlet h = null;\n\t\t\t\t\ttry { h = f.raycastSegment( a.x, a.y, a.z, b.x, b.y, b.z ); } catch ( e ) { h = null; }\n\t\t\t\t\tif ( h && ( ! best || h.t < best.t ) ) best = h;\n\n\t\t\t\t}\n\n\t\t\t\treturn best;\n\n\t\t\t}\n\t\t\t: null;\n" ],
	],
	// weapons: a fire bottle's pool is an event (citywreck polls weapons.fires without it)
	'src/features/weapons/Weapons.js': [
		[ "\t\tthis.fires.push( { id, x: at.x, y, z: at.z, t: 0, tick: 0, time: THROWN.firebottle.time } );\n",
			"\t\tthis.fires.push( { id, x: at.x, y, z: at.z, t: 0, tick: 0, time: THROWN.firebottle.time } );\n\t\tthis.emit( 'firePool', { id, x: at.x, y, z: at.z, by: 'player' } ); // (citywreck: the building it splashed is alight)\n" ],
	],
	// navy: the city's wanted level (2 stars and up) makes the navy offshore treat you as wanted
	'src/features/navy/Navy.js': [
		[ "\t\treturn { hull: !! ( hj && hj.vessel && hj.vessel.wanted ), level, offences, standing: this.standing };\n",
			"\t\tconst cw = this.get( 'citywreck' );\n\t\tlet city = 0;\n\t\ttry { city = cw && cw.wanted ? num( cw.wanted() ) : 0; } catch ( e ) { city = 0; }\n\t\treturn { hull: !! ( hj && hj.vessel && hj.vessel.wanted ), level, offences, standing: this.standing, city };\n" ],
		[ "return c.hull || c.level >= WANTED.notoriety || c.offences >= WANTED.offences || c.standing <= WANTED.standing;",
			"return c.hull || c.level >= WANTED.notoriety || c.offences >= WANTED.offences || c.standing <= WANTED.standing || c.city >= 2;" ],
	],
	// notices: the city's repair works and the damages claimed, in the board keeper's note
	'src/features/notices/Notices.js': [
		[ "\t\treturn { keeper, line, note };\n",
			"\t\tconst works = this.features && this.features.get ? this.features.get( 'citywreck' )?.bulletin?.( port ) : null;\n\t\tif ( works && works.length ) note = [ note, ...works ].filter( Boolean ).join( ' ' );\n\t\treturn { keeper, line, note };\n" ],
	],
	// townlife: no sitting in the rooms of a gutted or collapsed building
	'src/features/townlife/index.js': [
		[ "\t\tt.sim.interiorSeats = () => this.features?.get?.( 'interiors' )?.seatsFor?.( plan.id, { tavern: true } ) || [];\n",
			"\t\tt.sim.interiorSeats = () => ( this.features?.get?.( 'interiors' )?.seatsFor?.( plan.id, { tavern: true } ) || [] ).filter( ( s ) => this.features?.get?.( 'citywreck' )?.seatOpen?.( s ) ?? true );\n" ],
	],
};

let bad = 0;
for ( const [ rel, list ] of Object.entries( PATCHES ) ) {

	const f = join( root, rel );
	if ( ! existsSync( f ) ) { console.log( `MISSING ${ rel }` ); bad ++; continue; }
	let s = readFileSync( f, 'utf8' );
	const eol = s.includes( '\r\n' ) ? '\r\n' : '\n';
	let n = 0, skip = 0, ok = true;
	for ( let [ a, b ] of list ) {

		a = a.replace( /\n/g, eol ); b = b.replace( /\n/g, eol );
		if ( s.includes( b ) ) { skip ++; continue; }
		const k = s.split( a ).length - 1;
		if ( k !== 1 ) { console.log( `ANCHOR x${ k } in ${ rel }: ${ JSON.stringify( a.slice( 0, 70 ) ) }` ); ok = false; break; }
		s = s.replace( a, () => b );
		n ++;

	}

	if ( ! ok ) { bad ++; continue; }
	if ( n && ! dry ) writeFileSync( f, s );
	console.log( `${ dry ? 'would patch' : 'patched' } ${ rel }: ${ n } applied, ${ skip } already there` );

}

process.exit( bad ? 1 : 0 );
