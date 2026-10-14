// A browser stand-in for running the whole App in Node on Dawn (the `webgpu` npm package): enough DOM, canvas,
// fetch (relative URLs read public/), image decoding (flat grey: Node has no codecs), rAF and storage for
// App.init() and App.frame() to run unchanged. Import it first, then import the App (tools/perf/headless.mjs).
//
//   import { installEnv } from './headless-env.mjs';
//   await installEnv( { search: '?bench&noAudio', width: 2560, height: 1267, power: 'high-performance' } );
//
// The canvas context hands out an offscreen bgra8unorm texture of the canvas size, so the final post pass
// renders exactly as on screen (nothing is presented). Images are 2x2 grey: texture fetch cost is lower than in
// the browser, everything else (geometry, passes, shader cost per pixel) is the real thing.
import { create as createDefault, globals as globalsDefault } from 'webgpu';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, normalize } from 'node:path';

const ROOT = fileURLToPath( new URL( '../..', import.meta.url ) );
const PUBLIC = join( ROOT, 'public' );

// an element that accepts anything: unknown properties are elements / no-op functions
function element( tag = 'div' ) {

	const listeners = new Map();
	const children = [];
	const el = {
		tagName: String( tag ).toUpperCase(), nodeName: String( tag ).toUpperCase(), style: new Proxy( {}, { get: ( o, k ) => ( k in o ? o[ k ] : '' ), set: ( o, k, v ) => ( ( o[ k ] = v ), true ) } ),
		dataset: {}, children, childNodes: children, attributes: {}, className: '', id: '', innerHTML: '', textContent: '', value: '', hidden: false, checked: false,
		width: 300, height: 150, clientWidth: 0, clientHeight: 0, offsetWidth: 0, offsetHeight: 0, scrollTop: 0, parentNode: null, parentElement: null,
		classList: { _s: new Set(), add( ...c ) { c.forEach( ( x ) => this._s.add( x ) ); }, remove( ...c ) { c.forEach( ( x ) => this._s.delete( x ) ); }, toggle( c, f ) { const on = f ?? ! this._s.has( c ); if ( on ) this._s.add( c ); else this._s.delete( c ); return on; }, contains( c ) { return this._s.has( c ); } },
		appendChild( c ) { children.push( c ); if ( c && typeof c === 'object' ) c.parentNode = c.parentElement = el; return c; },
		append( ...cs ) { for ( const c of cs ) el.appendChild( c ); }, prepend( ...cs ) { for ( const c of cs ) children.unshift( c ); },
		insertBefore( c ) { return el.appendChild( c ); }, removeChild( c ) { const i = children.indexOf( c ); if ( i >= 0 ) children.splice( i, 1 ); return c; },
		replaceChildren( ...cs ) { children.length = 0; el.append( ...cs ); }, remove() { if ( el.parentNode ) el.parentNode.removeChild( el ); }, contains() { return false; },
		addEventListener( t, fn ) { if ( ! listeners.has( t ) ) listeners.set( t, new Set() ); listeners.get( t ).add( fn ); }, removeEventListener( t, fn ) { listeners.get( t )?.delete( fn ); },
		dispatchEvent() { return true; }, setAttribute( k, v ) { el.attributes[ k ] = String( v ); }, getAttribute( k ) { return el.attributes[ k ] ?? null; }, removeAttribute( k ) { delete el.attributes[ k ]; },
		hasAttribute( k ) { return k in el.attributes; }, querySelector() { return element( 'div' ); }, querySelectorAll() { return []; }, insertAdjacentHTML() {}, insertAdjacentElement( p, e ) { return e; }, closest() { return null; }, matches() { return false; },
		getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, right: el.width, bottom: el.height, width: el.width, height: el.height }; },
		focus() {}, blur() {}, click() {}, cloneNode() { return element( tag ); }, requestPointerLock() {}, scrollIntoView() {}, animate() { return { finished: Promise.resolve(), cancel() {} }; },
		getContext( kind ) { return kind === 'webgpu' ? webgpuContext( el ) : context2d( el ); },
		toDataURL() { return 'data:,'; },
	};
	return el;

}

// a 2D context that draws nothing (labels, name tags and notice boards come out blank)
function context2d( canvas ) {

	const fns = {
		measureText: ( t ) => ( { width: String( t ).length * 7, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 } ),
		getImageData: ( x, y, w, h ) => ( { data: new Uint8ClampedArray( Math.max( 1, w | 0 ) * Math.max( 1, h | 0 ) * 4 ).fill( 128 ), width: w, height: h } ),
		createImageData: ( w, h ) => ( { data: new Uint8ClampedArray( w * h * 4 ), width: w, height: h } ),
		createLinearGradient: () => ( { addColorStop() {} } ), createRadialGradient: () => ( { addColorStop() {} } ), createPattern: () => ( {} ),
		getTransform: () => ( { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } ),
	};
	return new Proxy( { canvas }, { get: ( o, k ) => ( k in o ? o[ k ] : fns[ k ] || ( () => {} ) ), set: ( o, k, v ) => ( ( o[ k ] = v ), true ) } );

}

// the canvas' WebGPU context: an offscreen texture of the canvas size, re-made when it changes
function webgpuContext( canvas ) {

	let tex = null, cfg = null;
	return {
		canvas,
		configure( c ) { cfg = c; },
		unconfigure() {},
		getCurrentTexture() {

			const w = Math.max( 1, canvas.width | 0 ), h = Math.max( 1, canvas.height | 0 );
			if ( ! tex || tex.width !== w || tex.height !== h ) {

				if ( tex ) tex.destroy();
				tex = cfg.device.createTexture( { size: [ w, h ], format: cfg.format, usage: cfg.usage | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC, label: 'canvas' } );

			}

			return tex;

		},
	};

}

function storage() {

	const m = new Map();
	return { getItem: ( k ) => ( m.has( k ) ? m.get( k ) : null ), setItem: ( k, v ) => m.set( k, String( v ) ), removeItem: ( k ) => m.delete( k ), clear: () => m.clear(), key: ( i ) => [ ...m.keys() ][ i ] ?? null, get length() { return m.size; } };

}

// relative URL -> file under public/ (or the project root for /src, /tools)
function fileOf( url ) {

	let p = String( url );
	if ( /^[a-z]+:\/\//i.test( p ) ) p = new URL( p ).pathname;
	p = decodeURIComponent( p.split( '?' )[ 0 ].split( '#' )[ 0 ] ).replace( /^\.?\//, '' );
	for ( const base of [ PUBLIC, ROOT ] ) {

		const f = normalize( join( base, p ) );
		if ( f.startsWith( base ) && existsSync( f ) ) return f;

	}

	return null;

}

const GREY = () => {

	const d = new Uint8Array( 16 ).fill( 128 );
	for ( let i = 3; i < 16; i += 4 ) d[ i ] = 255;
	return d;

};

export async function installEnv( { search = '?bench&noAudio', width = 2560, height = 1267, power = 'high-performance', flags = [], dawnDir = null } = {} ) {

	// dawnDir: a copy of node_modules/webgpu/dist/win32-x64 with Chrome's dxcompiler.dll + dxil.dll beside dawn.node,
	// so D3D12 compiles WGSL with DXC like the browser (the package ships FXC only: many minutes for this game)
	let create = createDefault, globals = globalsDefault;
	if ( dawnDir ) ( { create, globals } = createRequire( import.meta.url )( join( dawnDir, 'dawn.node' ) ) );
	Object.assign( globalThis, globals );
	const gpu = create( flags );
	const request = gpu.requestAdapter.bind( gpu );
	// the adapter is chosen here (Dawn honours the power preference: the discrete or the integrated GPU)
	gpu.requestAdapter = ( opts = {} ) => request( { ...opts, powerPreference: power } );
	if ( ! gpu.getPreferredCanvasFormat ) gpu.getPreferredCanvasFormat = () => 'bgra8unorm';
	const nav = { gpu, userAgent: 'node-dawn', language: 'en', languages: [ 'en' ], hardwareConcurrency: 8, getGamepads: () => [], maxTouchPoints: 0, platform: 'Win32', clipboard: { writeText: async () => {} } };
	Object.defineProperty( globalThis, 'navigator', { value: nav, configurable: true } );

	const body = element( 'body' ), head = element( 'head' );
	const byId = new Map();
	const doc = {
		body, head, documentElement: element( 'html' ), visibilityState: 'visible', hidden: false, readyState: 'complete', fonts: { ready: Promise.resolve(), load: async () => [] },
		createElement: ( t ) => element( t ), createElementNS: ( ns, t ) => element( t ), createTextNode: ( t ) => ( { textContent: t } ), createDocumentFragment: () => element( 'fragment' ),
		getElementById: ( id ) => { if ( ! byId.has( id ) ) byId.set( id, element( 'div' ) ); return byId.get( id ); },
		querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {}, exitPointerLock() {}, pointerLockElement: null, activeElement: null,
		hasFocus: () => true,
	};
	globalThis.document = doc;
	const win = globalThis;
	win.window = win;
	win.innerWidth = width;
	win.innerHeight = height;
	win.devicePixelRatio = 1;
	win.location = { search, href: 'http://127.0.0.1:5189/' + search, origin: 'http://127.0.0.1:5189', pathname: '/', hostname: '127.0.0.1', host: '127.0.0.1:5189', protocol: 'http:', port: '5189', hash: '' };
	win.addEventListener = () => {};
	win.removeEventListener = () => {};
	win.matchMedia = () => ( { matches: false, addEventListener() {}, removeEventListener() {} } );
	win.getComputedStyle = () => new Proxy( {}, { get: () => '' } );
	win.localStorage = storage();
	win.sessionStorage = storage();
	win.requestAnimationFrame = ( cb ) => setTimeout( () => cb( performance.now() ), 0 );
	win.cancelAnimationFrame = ( id ) => clearTimeout( id );
	win.HTMLElement = win.HTMLElement || class {};
	win.HTMLCanvasElement = win.HTMLCanvasElement || class {};
	win.Image = class { constructor() { this.width = 2; this.height = 2; setTimeout( () => this.onload && this.onload(), 0 ); } };
	win.OffscreenCanvas = class { constructor( w, h ) { this.width = w; this.height = h; } getContext( k ) { return context2d( this ); } };
	win.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
	win.AudioContext = undefined; // ?noAudio: the soundscape is not built

	// image decoding: flat grey (the loaders' headless hooks and createImageBitmap)
	win.__assetImage = async () => ( { data: GREY(), width: 2, height: 2 } );
	win.createImageBitmap = async () => ( { width: 2, height: 2, close() {}, __grey: true } );
	win.__assetFile = async ( url ) => {

		const f = fileOf( url );
		if ( globalThis.__fetchLog ) globalThis.__fetchLog.push( String( url ) ); // (wave 19A: headless.mjs --log-fetch)
		if ( ! f ) throw new Error( 'no file for ' + url );
		const b = readFileSync( f );
		return b.buffer.slice( b.byteOffset, b.byteOffset + b.byteLength );

	};

	const netFetch = globalThis.fetch;
	win.fetch = async ( url, opts ) => {

		const u = String( url && url.url ? url.url : url );
		if ( opts && opts.method === 'POST' ) return new Response( 'ok' ); // the collector is not running: results stay in memory
		if ( /^https?:\/\/(?!127\.0\.0\.1:5189)/.test( u ) ) return netFetch( url, opts );
		const f = fileOf( u );
		if ( globalThis.__fetchLog ) globalThis.__fetchLog.push( u );
		if ( ! f ) return new Response( 'not found', { status: 404 } );
		const ext = f.split( '.' ).pop().toLowerCase();
		const type = { json: 'application/json', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', glb: 'model/gltf-binary', bin: 'application/octet-stream', ogg: 'audio/ogg', wasm: 'application/wasm' }[ ext ] || 'application/octet-stream';
		return new Response( readFileSync( f ), { status: 200, headers: { 'content-type': type } } );

	};

	return { gpu, document: doc };

}
