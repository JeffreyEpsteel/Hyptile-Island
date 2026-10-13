// Splice clips from a freshly built roster GLB into a committed one: the named animations of <base.glb> are replaced by the
// ones of the same name in <fresh.glb> (added when missing); everything else in <base.glb> (meshes, skin, textures, every other
// clip) keeps its data. Unreferenced accessors / buffer views are dropped and the binary chunk is repacked.
//   node tools/roster/splice-clips.mjs <base.glb> <fresh.glb> <out.glb> Clip_A Clip_B ...
// Why: tools/roster/build.ps1 rebuilds whole GLBs, but some inputs of the committed build (the Kimodo Idle_Breathe /
// Walk_InPlace takes passed with -Override) were re-generated after it, so a full rebuild would change clips nobody asked to
// change. Build into a scratch folder (-OutDir), then splice only the fixed clips (README "Rebased clips").
import { readFileSync, writeFileSync } from 'node:fs';

export function readGLB( buf ) {

	const dv = new DataView( buf.buffer, buf.byteOffset, buf.byteLength );
	if ( dv.getUint32( 0, true ) !== 0x46546C67 ) throw new Error( 'not a GLB' );
	let o = 12, json = null, bin = new Uint8Array( 0 );
	while ( o < buf.byteLength ) {

		const len = dv.getUint32( o, true ), type = dv.getUint32( o + 4, true );
		const chunk = buf.subarray( o + 8, o + 8 + len );
		if ( type === 0x4E4F534A ) json = JSON.parse( new TextDecoder().decode( chunk ) );
		else if ( type === 0x004E4942 ) bin = chunk;
		o += 8 + len;

	}

	return { json, bin };

}

export function writeGLB( json, bin ) {

	const enc = new TextEncoder().encode( JSON.stringify( json ) );
	const jl = ( enc.length + 3 ) & ~ 3, bl = ( bin.length + 3 ) & ~ 3;
	const out = new Uint8Array( 12 + 8 + jl + 8 + bl );
	const dv = new DataView( out.buffer );
	dv.setUint32( 0, 0x46546C67, true ); dv.setUint32( 4, 2, true ); dv.setUint32( 8, out.length, true );
	dv.setUint32( 12, jl, true ); dv.setUint32( 16, 0x4E4F534A, true );
	out.set( enc, 20 ); out.fill( 0x20, 20 + enc.length, 20 + jl );
	dv.setUint32( 20 + jl, bl, true ); dv.setUint32( 24 + jl, 0x004E4942, true );
	out.set( bin, 28 + jl );
	return out;

}

// the bytes of one accessor's buffer view (the whole view: accessors here never share a strided view)
function viewBytes( g, vi ) {

	const v = g.json.bufferViews[ vi ];
	return g.bin.subarray( v.byteOffset || 0, ( v.byteOffset || 0 ) + v.byteLength );

}

export function spliceClips( base, fresh, names ) {

	const J = structuredClone( base.json );
	const F = fresh.json;
	const nodeByName = new Map( J.nodes.map( ( n, i ) => [ n.name, i ] ) );
	// new data goes after the old binary: views appended to a list of extra chunks
	const extra = [];
	let extraLen = 0;
	const addView = ( bytes, src ) => {

		const pad = ( 4 - ( ( base.bin.length + extraLen ) & 3 ) ) & 3;
		if ( pad ) { extra.push( new Uint8Array( pad ) ); extraLen += pad; }
		const view = { buffer: 0, byteOffset: base.bin.length + extraLen, byteLength: bytes.length };
		if ( src.byteStride ) view.byteStride = src.byteStride;
		extra.push( bytes ); extraLen += bytes.length;
		J.bufferViews.push( view );
		return J.bufferViews.length - 1;

	};

	const copyAccessor = ( ai ) => {

		const a = structuredClone( F.accessors[ ai ] );
		a.bufferView = addView( viewBytes( fresh, a.bufferView ), F.bufferViews[ a.bufferView ] );
		J.accessors.push( a );
		return J.accessors.length - 1;

	};

	for ( const name of names ) {

		const src = ( F.animations || [] ).find( ( a ) => a.name === name );
		if ( ! src ) throw new Error( 'fresh GLB has no clip ' + name );
		const memo = new Map();
		const acc = ( ai ) => { if ( ! memo.has( ai ) ) memo.set( ai, copyAccessor( ai ) ); return memo.get( ai ); };
		const anim = { name, samplers: src.samplers.map( ( s ) => ( { ...s, input: acc( s.input ), output: acc( s.output ) } ) ), channels: [] };
		for ( const c of src.channels ) {

			const nn = F.nodes[ c.target.node ].name;
			if ( ! nodeByName.has( nn ) ) throw new Error( `clip ${ name }: node ${ nn } is not in the base GLB` );
			anim.channels.push( { sampler: c.sampler, target: { ...c.target, node: nodeByName.get( nn ) } } );

		}

		J.animations = J.animations || [];
		const at = J.animations.findIndex( ( a ) => a.name === name );
		if ( at >= 0 ) J.animations[ at ] = anim; else J.animations.push( anim );

	}

	// one binary: the old one, then the new views
	const bin = new Uint8Array( base.bin.length + extraLen );
	bin.set( base.bin );
	let o = base.bin.length;
	for ( const e of extra ) { bin.set( e, o ); o += e.length; }
	return compact( J, bin );

}

// drop accessors / buffer views nothing refers to, repack the binary (4-byte aligned views)
function compact( J, bin ) {

	const usedAcc = new Set();
	const useA = ( i ) => { if ( Number.isInteger( i ) ) usedAcc.add( i ); };
	for ( const m of J.meshes || [] ) for ( const p of m.primitives ) {

		Object.values( p.attributes ).forEach( useA ); useA( p.indices );
		for ( const t of p.targets || [] ) Object.values( t ).forEach( useA );

	}

	for ( const s of J.skins || [] ) useA( s.inverseBindMatrices );
	for ( const a of J.animations || [] ) for ( const s of a.samplers ) { useA( s.input ); useA( s.output ); }
	const accMap = new Map(), accessors = [];
	J.accessors.forEach( ( a, i ) => { if ( usedAcc.has( i ) ) { accMap.set( i, accessors.length ); accessors.push( a ); } } );
	const usedView = new Set();
	for ( const a of accessors ) {

		if ( Number.isInteger( a.bufferView ) ) usedView.add( a.bufferView );
		if ( a.sparse ) { usedView.add( a.sparse.indices.bufferView ); usedView.add( a.sparse.values.bufferView ); }

	}

	for ( const im of J.images || [] ) if ( Number.isInteger( im.bufferView ) ) usedView.add( im.bufferView );
	const viewMap = new Map(), views = [], parts = [];
	let len = 0;
	J.bufferViews.forEach( ( v, i ) => {

		if ( ! usedView.has( i ) ) return;
		const pad = ( 4 - ( len & 3 ) ) & 3;
		if ( pad ) { parts.push( new Uint8Array( pad ) ); len += pad; }
		const bytes = bin.subarray( v.byteOffset || 0, ( v.byteOffset || 0 ) + v.byteLength );
		viewMap.set( i, views.length );
		views.push( { ...v, byteOffset: len } );
		parts.push( bytes ); len += bytes.length;

	} );
	const out = new Uint8Array( len );
	let o = 0;
	for ( const p of parts ) { out.set( p, o ); o += p.length; }
	const A = ( i ) => accMap.get( i );
	for ( const a of accessors ) {

		if ( Number.isInteger( a.bufferView ) ) a.bufferView = viewMap.get( a.bufferView );
		if ( a.sparse ) { a.sparse.indices.bufferView = viewMap.get( a.sparse.indices.bufferView ); a.sparse.values.bufferView = viewMap.get( a.sparse.values.bufferView ); }

	}

	for ( const m of J.meshes || [] ) for ( const p of m.primitives ) {

		for ( const k in p.attributes ) p.attributes[ k ] = A( p.attributes[ k ] );
		if ( Number.isInteger( p.indices ) ) p.indices = A( p.indices );
		for ( const t of p.targets || [] ) for ( const k in t ) t[ k ] = A( t[ k ] );

	}

	for ( const s of J.skins || [] ) if ( Number.isInteger( s.inverseBindMatrices ) ) s.inverseBindMatrices = A( s.inverseBindMatrices );
	for ( const an of J.animations || [] ) for ( const s of an.samplers ) { s.input = A( s.input ); s.output = A( s.output ); }
	for ( const im of J.images || [] ) if ( Number.isInteger( im.bufferView ) ) im.bufferView = viewMap.get( im.bufferView );
	J.accessors = accessors;
	J.bufferViews = views;
	J.buffers = [ { byteLength: out.length } ];
	return { json: J, bin: out };

}

if ( process.argv[ 1 ] && import.meta.url.endsWith( process.argv[ 1 ].replace( /\\/g, '/' ).split( '/' ).pop() ) ) {

	const [ basePath, freshPath, outPath, ...names ] = process.argv.slice( 2 );
	if ( ! outPath || ! names.length ) {

		console.error( 'usage: node tools/roster/splice-clips.mjs <base.glb> <fresh.glb> <out.glb> Clip ...' );
		process.exit( 2 );

	}

	const r = spliceClips( readGLB( readFileSync( basePath ) ), readGLB( readFileSync( freshPath ) ), names );
	const bytes = writeGLB( r.json, r.bin );
	writeFileSync( outPath, bytes );
	console.log( 'SPLICED', outPath, bytes.length, names.join( ' ' ) );

}
