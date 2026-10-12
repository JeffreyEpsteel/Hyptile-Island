// Module resolve hook for the headless perf runs: a bare package that is not installed yet (another worker's new
// dependency, before the root runs npm install) resolves to an empty stub instead of stopping the run. The stubbed
// names are printed; the perf scenarios do not go online, so the stubs are never called.
//   registered by tools/perf/headless.mjs (module.register)
export async function resolve( specifier, context, next ) {

	try {

		return await next( specifier, context );

	} catch ( e ) {

		if ( e && e.code === 'ERR_MODULE_NOT_FOUND' && /^[@a-z]/i.test( specifier ) && ! specifier.startsWith( 'node:' ) ) {

			process.stderr.write( `headless: '${ specifier }' is not installed: stubbed\n` );
			const code = 'class Stub { constructor() { throw new Error( "stubbed package" ); } } export const Client = Stub, Room = Stub, Schema = Stub, Encoder = Stub, Decoder = Stub, Reflection = Stub, MapSchema = Stub, ArraySchema = Stub; export function registerSerializer() {} export function decode() {} export function encode() {} export function type() { return () => {}; } export function defineTypes() {} export default { Client: Stub };';
			return { url: 'data:text/javascript,' + encodeURIComponent( code ), shortCircuit: true, format: 'module' };

		}

		throw e;

	}

}
