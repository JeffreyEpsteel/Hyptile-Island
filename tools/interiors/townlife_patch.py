import sys, os
# applies the wave 19E townlife patch to a townlife folder (argv[1]); asserts every anchor once
d = sys.argv[ 1 ]
P = [
	( 'Citizens.js', "\t\tthis.hidden = false;\n", "\t\tthis.hidden = false;\n\t\tthis.indoorFloor = null; // (wave 19E) seated in an interior (src/world/interiors): its floor's height\n\t\tthis.indoorDoor = null;\n" ),
	( 'Citizens.js', "\t\t// up from a seat first (the near ones play it; out of sight they just go)\n",
		"\t\t// (wave 19E) out of an interior: back at its door first\n\t\tif ( c.indoorFloor !== null ) { c.x = c.indoorDoor.x; c.z = c.indoorDoor.z; c.indoorFloor = null; c.indoorDoor = null; }\n\t\t// up from a seat first (the near ones play it; out of sight they just go)\n" ),
	( 'Citizens.js', "\t\tif ( g.indoors ) c.hidden = true;\n",
		"\t\tif ( g.indoors && g.seat ) {\n\n\t\t\t// (wave 19E) through the tavern's door to a seat in its interior: seated there, drawn on its floor\n\t\t\tc.indoorDoor = { x: g.x, z: g.z };\n\t\t\tc.x = g.seat.x; c.z = g.seat.z; c.yaw = g.seat.yaw + Math.PI;\n\t\t\tc.indoorFloor = g.seat.floor;\n\t\t\tc.hidden = false;\n\n\t\t} else if ( g.indoors ) c.hidden = true;\n" ),
	( 'Citizens.js', "\t\t\t\tS.release( c.id );\n\t\t\t\t// the patio is full: inside, where it is loud\n\t\t\t\treturn this._goal( c, { x: T.door.x, z: T.door.z, yaw: T.door.yaw, indoors: true, kind: 'tavernIn' } );\n",
		"\t\t\t\tS.release( c.id );\n\t\t\t\t// the patio is full: inside, where it is loud (wave 19E: on a free seat of the tavern's interior when it has one)\n\t\t\t\tconst In = this.interiorSeats ? this.interiorSeats() : null;\n\t\t\t\tconst ik = In && In.length ? S.claim( 'inside', In.length, c.id ) : - 1;\n\t\t\t\tif ( ik >= 0 ) { const s = In[ ik ]; return this._goal( c, { x: T.door.x, z: T.door.z, yaw: T.door.yaw, indoors: true, kind: 'tavernIn', look: LOOK.seat, h: s.h, seat: s, dwell: Infinity } ); }\n\t\t\t\treturn this._goal( c, { x: T.door.x, z: T.door.z, yaw: T.door.yaw, indoors: true, kind: 'tavernIn' } );\n" ),
	( 'index.js', "\t\tt.sim.setSeats( this._seats( plan.id ).filter( ( s ) => t.grid.nearestFree( s.x, s.z, 2 ) ) );\n",
		"\t\tt.sim.setSeats( this._seats( plan.id ).filter( ( s ) => t.grid.nearestFree( s.x, s.z, 2 ) ) );\n\t\t// (wave 19E) the taverns' interiors (src/world/interiors): tavern-goers past a full patio sit inside\n\t\tt.sim.interiorSeats = () => this.features?.get?.( 'interiors' )?.seatsFor?.( plan.id, { tavern: true } ) || [];\n" ),
	( 'index.js', "\t\t\t\tif ( c.body || d2 < hide * hide ) c.y = ( ground ? ground( c.x + ox, c.z + oz ) : 0 ) + sit;\n",
		"\t\t\t\tif ( c.body || d2 < hide * hide ) c.y = ( c.indoorFloor !== null ? c.indoorFloor : ground ? ground( c.x + ox, c.z + oz ) : 0 ) + sit; // (wave 19E: an interior's floor)\n" ),
]
for f, a, b in P:
	p = os.path.join( d, f )
	s = open( p, encoding = 'utf-8' ).read()
	assert s.count( a ) == 1, ( f, a[ :60 ] )
	s = s.replace( a, b )
	open( p, 'w', encoding = 'utf-8', newline = '\n' ).write( s )
print( 'patched', d )
