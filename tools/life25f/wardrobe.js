const WARDROBE = [ 'umb', 'plain', 'umb', 'oil', 'umb' ];
// the --eval body of tools/life/capture.mjs for a wardrobe line-up: five citizens in a row facing the camera (a bride, a groom,
// oilskins, an umbrella, a plain one), held in place (an event role keeps the town's thinking off them)
//   node tools/life/capture.mjs ... --pose=<default pose> --eval="$(cat tools/life25f/wardrobe.js)"   (app, tl in scope)
const s = tl.sims.tidemark;
// (the pose passed to the capture: the camera at ( 1835.4, 4.7 ) looking at ( 1823.4, -7.3 ); the line-up stands 3.8 m ahead of it)
const cam = { x: 1835.4, z: 4.7 }, look = { x: 1823.4, z: - 7.3 }, L = Math.hypot( look.x - cam.x, look.z - cam.z ), dx = ( look.x - cam.x ) / L, dz = ( look.z - cam.z ) / L;
let k = 0;
const u = tl.update.bind( tl );
const kit = ( typeof WARDROBE !== 'undefined' ? WARDROBE : [ 'bride', 'groom', 'oil', 'umb', 'plain' ] );
let cast = null;
tl.update = ( dt ) => {

	k ++;
	if ( k === 120 ) {

		cast = s.list.filter( ( c ) => c.role !== 'child' && ! c.hidden ).slice( 0, 5 ).map( ( c, i ) => ( { c, i } ) );
		globalThis.__wcast = cast;

	}

	if ( cast ) {

		const px = - dz, pz = dx;
		for ( const { c, i } of cast ) {

			const x = cam.x + dx * 4.4 + px * ( i - 2 ) * 1.15, z = cam.z + dz * 4.4 + pz * ( i - 2 ) * 1.15;
			c.x = x; c.z = z; c.path = null; c.pending = null; c.moving = false; c.hidden = false; c.fleeing = false; c.react = null; c.gesture = null;
			c.eventRole = 'wardrobe'; c.act = 'stroll'; c.yaw = Math.atan2( - ( cam.x - x ), - ( cam.z - z ) );
			c.goal = { x, z, yaw: c.yaw, look: { base: 'Idle_Breathe', alts: [], gestures: [] }, kind: 'wardrobe', dwell: Infinity };
			c.dress = kit[ i ] === 'bride' ? 'bride' : kit[ i ] === 'groom' ? 'groom' : null;
			c.oilskin = kit[ i ] === 'oil';
			c.umbrella = kit[ i ] === 'umb';
			c.sheltering = false;

		}

	}

	u( dt );

};
