// A counting stand-in for the document (wave 12D, tools/perf/cpu-scenarios.mjs): the HUDs of the feature modules build
// and update their elements on it in node, and every write is counted, so a scenario can report how many textContent /
// innerHTML / style / class writes a frame makes and how many of them set the value it already had (a browser still
// replaces the text node of a same-value textContent write and relayouts; a same-value style write is skipped by Blink
// but its string was built for nothing).
//   const dom = makeDoc();  dom.doc  (pass as opts.doc)   dom.counts  { text, textSame, html, htmlSame, style, styleSame, cls, attr, attrSame, prop, propSame }
//   dom.reset()

export function makeDoc() {

	const counts = { text: 0, textSame: 0, html: 0, htmlSame: 0, style: 0, styleSame: 0, cls: 0, create: 0, attr: 0, attrSame: 0, prop: 0, propSame: 0 };

	const styleOf = () => {

		const t = {};
		return new Proxy( t, {
			set( o, k, v ) {

				counts.style ++;
				if ( o[ k ] === String( v ) ) counts.styleSame ++;
				o[ k ] = String( v );
				return true;

			},
			get( o, k ) {

				if ( k === 'setProperty' ) return ( n, v ) => {

					counts.style ++;
					if ( o[ n ] === String( v ) ) counts.styleSame ++;
					o[ n ] = String( v );

				};
				if ( k === 'removeProperty' ) return ( n ) => { delete o[ n ]; };
				if ( k === 'getPropertyValue' ) return ( n ) => o[ n ] ?? '';
				return typeof k === 'string' ? ( o[ k ] ?? '' ) : undefined;

			},
		} );

	};

	class ClassList {

		constructor( el ) { this.el = el; this.set = new Set(); }
		add( ...c ) { counts.cls ++; for ( const x of c ) this.set.add( x ); }
		remove( ...c ) { counts.cls ++; for ( const x of c ) this.set.delete( x ); }
		toggle( c, on ) { counts.cls ++; const v = on === undefined ? ! this.set.has( c ) : !! on; if ( v ) this.set.add( c ); else this.set.delete( c ); return v; }
		contains( c ) { return this.set.has( c ); }

	}

	class El {

		constructor( tag ) {

			counts.create ++;
			this.tagName = String( tag ).toUpperCase();
			this.nodeType = 1;
			this.children = [];
			this.childNodes = this.children;
			this.parentNode = null;
			this.parentElement = null;
			this._text = '';
			this._html = '';
			this.id = '';
			this.attributes = {};
			this.dataset = {};
			this.style = styleOf();
			this.classList = new ClassList( this );
			this.hidden = false;
			this._disabled = false;
			this._title = '';
			this.value = '';
			this.offsetWidth = 100;
			this.offsetHeight = 20;
			this.clientWidth = 100;
			this.clientHeight = 20;
			this.scrollTop = 0;

		}

		// (wave 16C: title / disabled / setAttribute writes are counted too: prop, attr)
		get title() { return this._title; }
		set title( v ) { counts.prop ++; if ( this._title === v ) counts.propSame ++; this._title = v; }
		get disabled() { return this._disabled; }
		set disabled( v ) { counts.prop ++; if ( this._disabled === v ) counts.propSame ++; this._disabled = v; }
		get className() { return [ ...this.classList.set ].join( ' ' ); }
		set className( v ) { counts.cls ++; this.classList.set = new Set( String( v ).split( /\s+/ ).filter( Boolean ) ); }
		get textContent() { return this._text; }
		set textContent( v ) {

			v = v == null ? '' : String( v );
			counts.text ++;
			if ( v === this._text ) counts.textSame ++;
			this._text = v;
			this.children.length = 0;

		}

		get innerText() { return this._text; }
		set innerText( v ) { this.textContent = v; }
		get innerHTML() { return this._html; }
		set innerHTML( v ) {

			v = String( v );
			counts.html ++;
			if ( v === this._html ) counts.htmlSame ++;
			this._html = v;
			this.children.length = 0;

		}

		get firstChild() { return this.children[ 0 ] || null; }
		get lastChild() { return this.children[ this.children.length - 1 ] || null; }
		get isConnected() { return true; }
		append( ...ns ) { for ( const n of ns ) this.appendChild( typeof n === 'string' ? new Text( n ) : n ); }
		prepend( ...ns ) { for ( const n of ns.reverse() ) this.insertBefore( typeof n === 'string' ? new Text( n ) : n, this.children[ 0 ] || null ); }
		appendChild( n ) { if ( n.parentNode ) n.parentNode.removeChild( n ); this.children.push( n ); n.parentNode = n.parentElement = this; return n; }
		insertBefore( n, ref ) { if ( n.parentNode ) n.parentNode.removeChild( n ); const i = ref ? this.children.indexOf( ref ) : - 1; if ( i < 0 ) this.children.push( n ); else this.children.splice( i, 0, n ); n.parentNode = n.parentElement = this; return n; }
		removeChild( n ) { const i = this.children.indexOf( n ); if ( i >= 0 ) this.children.splice( i, 1 ); n.parentNode = n.parentElement = null; return n; }
		replaceChildren( ...ns ) { this.children.length = 0; this.append( ...ns ); }
		remove() { if ( this.parentNode ) this.parentNode.removeChild( this ); }
		setAttribute( k, v ) { counts.attr ++; if ( this.attributes[ k ] === String( v ) ) counts.attrSame ++; this.attributes[ k ] = String( v ); }
		getAttribute( k ) { return k in this.attributes ? this.attributes[ k ] : null; }
		removeAttribute( k ) { delete this.attributes[ k ]; }
		hasAttribute( k ) { return k in this.attributes; }
		toggleAttribute( k, on ) { if ( on ) this.attributes[ k ] = ''; else delete this.attributes[ k ]; }
		addEventListener() {}
		removeEventListener() {}
		dispatchEvent() { return true; }
		querySelector() { return null; }
		querySelectorAll() { return []; }
		closest() { return null; }
		contains( n ) { return n === this; }
		focus() {}
		blur() {}
		click() {}
		getBoundingClientRect() { return { left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20, x: 0, y: 0 }; }
		animate() { return { cancel() {}, finished: Promise.resolve() }; }
		cloneNode() { return new El( this.tagName ); }

	}

	class Text {

		constructor( t ) { this.nodeType = 3; this.textContent = t; this.parentNode = null; }
		remove() { if ( this.parentNode ) this.parentNode.removeChild( this ); }

	}

	const doc = {
		createElement: ( t ) => new El( t ),
		createElementNS: ( ns, t ) => new El( t ),
		createTextNode: ( t ) => new Text( t ),
		createDocumentFragment: () => new El( '#fragment' ),
		head: new El( 'head' ),
		body: new El( 'body' ),
		documentElement: new El( 'html' ),
		getElementById: () => null,
		querySelector: () => null,
		querySelectorAll: () => [],
		addEventListener() {},
		removeEventListener() {},
		hidden: false,
		visibilityState: 'visible',
	};

	return {
		doc, counts,
		reset() { for ( const k in counts ) counts[ k ] = 0; },
	};

}
