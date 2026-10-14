import sys
p = sys.argv[ 1 ]
s = open( p, encoding = 'utf-8' ).read()
P = [
	( "\t\tconst target = _v2.set( feet.x, feet.y + ( this.mode === 'swim' ? 0.6 : ARM.height ), feet.z );\n",
	  "\t\tconst target = _v2.set( feet.x, feet.y + ( this.mode === 'swim' ? 0.6 : ARM.height ), feet.z );\n\t\tif ( this.indoor ) this.indoor.pivot( target ); // (wave 19E, src/world/interiors) indoors the pivot stays under the ceiling\n" ),
	( "\t\tthis.camera.position.copy( this.armPivot ).addScaledVector( back, dist ).addScaledVector( side, ARM.side );\n",
	  "\t\tif ( this.indoor ) dist = this.indoor.arm( this.armPivot, back, dist ); // (wave 19E) the closer arm that stays in the room\n\t\tthis.camera.position.copy( this.armPivot ).addScaledVector( back, dist ).addScaledVector( side, ARM.side );\n" ),
]
for a, b in P:
	assert s.count( a ) == 1, a
	s = s.replace( a, b )
open( p, 'w', encoding = 'utf-8', newline = '\n' ).write( s )
print( 'patched', p )
