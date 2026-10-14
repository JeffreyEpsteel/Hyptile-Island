import sys
p = sys.argv[ 1 ]
s = open( p, encoding = 'utf-8' ).read()
P = [
	( "\t\tif ( on > 0.002 && this.enabled ) {\n",
	  "\t\t// (wave 19E) the interiors' lamps (sources with `indoor` > 0, src/world/interiors) burn by day too\n\t\tconst indoor = this.sources.some( ( s ) => s.indoor > 0 && s.enabled !== false );\n\t\tif ( ( on > 0.002 || indoor ) && this.enabled ) {\n" ),
	( "\t\t\t\tconst k = s.intensity * on * fade * fl2 * ( s.scale ?? 1 );\n",
	  "\t\t\t\tconst k = s.intensity * ( s.indoor > 0 ? Math.max( on, s.indoor * this.strength ) : on ) * fade * fl2 * ( s.scale ?? 1 );\n" ),
]
for a, b in P:
	assert s.count( a ) == 1, a
	s = s.replace( a, b )
open( p, 'w', encoding = 'utf-8', newline = '\n' ).write( s )
print( 'patched', p )
