# Home-screen icons for the web app manifest (wave 6, mobile): Hyptile's head and shoulders from the loader key art,
# full bleed (the maskable safe circle keeps the head), the sky above the art's top edge filled with its
# first row's clear sky. Run headless:
#   D:\blender\blender.exe -b --factory-startup --python tools/mobile/make_icons.py
import os
import bpy
import numpy as np

ROOT = os.path.abspath( os.path.join( os.path.dirname( __file__ ), '..', '..' ) )
SRC = os.path.join( ROOT, 'public', 'ui', 'keyart', 'hyptile-loader-2560.jpg' )
OUT = os.path.join( ROOT, 'public', 'icons' )
# the crop in the 2560 x 1440 art: centred on the head and chest, 1200 px square (it starts above the top edge)
CX, CY, HALF = 1612, 470, 600
SIZES = { 'icon-512.png': 512, 'icon-192.png': 192, 'apple-touch-icon.png': 180, 'icon-maskable-512.png': 512, 'favicon-32.png': 32 }

img = bpy.data.images.load( SRC )
w, h = img.size
px = np.array( img.pixels[ : ], dtype=np.float32 ).reshape( h, w, 4 )[ : : - 1 ] # top row first
S = HALF * 2
ys = np.clip( np.arange( CY - HALF, CY + HALF ), 0, h - 1 )
xs = np.clip( np.arange( CX - HALF, CX + HALF ), 0, w - 1 )
crop = px[ ys ][ :, xs ].copy()
# above the art's top edge: the clear sky of its first row (its left part: the right has a cloud on the edge)
pad = CY - HALF
if pad < 0:
	sky = px[ 0, CX - HALF : CX + HALF // 3 ].mean( axis=0 )
	crop[ : - pad ] = sky
crop[ ..., 3 ] = 1.0

def halve( a ):
	return 0.25 * ( a[ 0 : : 2, 0 : : 2 ] + a[ 1 : : 2, 0 : : 2 ] + a[ 0 : : 2, 1 : : 2 ] + a[ 1 : : 2, 1 : : 2 ] )

def resize( a, n ):
	# box-halve while the image is more than twice the target, then Blender's scale for the last step
	while a.shape[ 0 ] >= n * 2 and a.shape[ 0 ] % 2 == 0:
		a = halve( a )
	im = bpy.data.images.new( 'tmp', a.shape[ 1 ], a.shape[ 0 ], alpha=True )
	im.pixels[ : ] = a[ : : - 1 ].ravel()
	if a.shape[ 0 ] != n:
		im.scale( n, n )
	return im

os.makedirs( OUT, exist_ok=True )
for name, n in SIZES.items():
	im = resize( crop, n )
	im.filepath_raw = os.path.join( OUT, name )
	im.file_format = 'PNG'
	im.save()
	print( 'wrote', name, n )
