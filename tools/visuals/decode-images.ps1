# Decodes the JPEG / PNG blobs the headless capture queued (<hash>.img) into 8-bit RGBA PNGs (<hash>.png), at most
# -Max px on the long side. Windows' own GDI+ (System.Drawing): no package, no download. Node has no image codecs, so
# without this the headless App draws every texture flat grey (tools/perf/headless-env.mjs).
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/visuals/decode-images.ps1 -Dir <cache> [-Max 1024]
param( [Parameter( Mandatory = $true )][string]$Dir, [int]$Max = 1024 )
Add-Type -AssemblyName System.Drawing
$n = 0
foreach ( $f in Get-ChildItem -Path $Dir -Filter '*.img' ) {
	$out = [System.IO.Path]::ChangeExtension( $f.FullName, '.png' )
	if ( Test-Path $out ) { continue }
	try {
		$src = [System.Drawing.Image]::FromFile( $f.FullName, $false )
		$k = [Math]::Min( 1.0, $Max / [Math]::Max( $src.Width, $src.Height ) )
		$w = [Math]::Max( 1, [int][Math]::Round( $src.Width * $k ) )
		$h = [Math]::Max( 1, [int][Math]::Round( $src.Height * $k ) )
		$bmp = New-Object System.Drawing.Bitmap( $w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb )
		$g = [System.Drawing.Graphics]::FromImage( $bmp )
		$g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
		$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
		$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
		$attr = New-Object System.Drawing.Imaging.ImageAttributes
		$attr.SetWrapMode( [System.Drawing.Drawing2D.WrapMode]::TileFlipXY ) # (no dark rim from the resampler)
		$g.DrawImage( $src, ( New-Object System.Drawing.Rectangle( 0, 0, $w, $h ) ), 0, 0, $src.Width, $src.Height, [System.Drawing.GraphicsUnit]::Pixel, $attr )
		$g.Dispose(); $src.Dispose()
		$bmp.Save( $out, [System.Drawing.Imaging.ImageFormat]::Png )
		$bmp.Dispose()
		$n++
	} catch {
		Write-Output ( 'failed ' + $f.Name + ': ' + $_.Exception.Message )
	}
}
Write-Output ( 'decoded ' + $n )
