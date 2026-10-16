// The player's own avatar as the driver / pilot (wave 25E). Seen from outside it sits in the seat with its hands and feet
// on the controls (the vehicle's ikTargets() -> Avatar.setIKTargets, an App patch). Behind the first-person eye the
// same body is drawn (the arms on the wheel or the cyclic, the legs to the pedals) but its head is folded away: the eye
// sits where the head is, and from inside a head you see the inside of a head. This wraps the skinned model's pose
// override once per model and, while asked, scales the head joint (and with it the hair and the eyes) to nothing after
// the clip, the overlay and the IK have run; the next frame's clip restores it.
//
//   foldHead( avatar, on, owner )     every frame (on: piloted and in the first person); the head folds while any owner
//                                     (the cars, the helicopter) asks
export function foldHead( avatar, on, owner = 'default' ) {

	const m = avatar && avatar.model;
	if ( ! m || ! m.local || ! m.gltf ) return false;
	let h = m.__foldHead;
	if ( ! h ) {

		if ( ! on ) return false;
		const i = m.gltf.nodes.findIndex( ( n ) => n.name === 'head' );
		if ( i < 0 ) return false;
		h = m.__foldHead = { i, on: false, owners: new Set(), orig: m.poseOverride, fn: null };
		h.fn = ( mm ) => {

			const r = h.orig ? h.orig( mm ) : undefined;
			if ( h.on ) { const s = mm.local[ h.i ].s; s[ 0 ] = s[ 1 ] = s[ 2 ] = 0.001; }
			return r;

		};
		m.poseOverride = h.fn;

	}
	// (another owner replaced the hook since: take its function as the one we wrap)
	if ( m.poseOverride !== h.fn ) { h.orig = m.poseOverride; m.poseOverride = h.fn; }
	if ( on ) h.owners.add( owner ); else h.owners.delete( owner );
	h.on = h.owners.size > 0;
	return h.on;

}
