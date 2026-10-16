// The roofs that are not colliders (wave 25C): a house's walls are boxes, its roof and the porch eave over its front are only
// drawn, so the third-person camera used to float above a porch roof with the player under it. A building registers its roof here
// (src/world/Village.js, the town kits); src/player/CameraRig.js casts the camera's arm against them.
//   registerRoof( id, { x, z, yaw, w, d, cz = 0, y0, y1 } )   a box in the building's frame: centre ( 0, cz ) of its footprint, w wide
//                                  (local x), d deep (local z), from y0 (the eave's underside) to y1 (the ridge), world metres
//   roofs() -> Map      clearRoofs()
// The frame is the buildings': world = ( x + lx cos + lz sin, z - lx sin + lz cos ).

const _roofs = new Map();

export function registerRoof( id, roof ) {

	if ( ! roof || ! Number.isFinite( roof.y0 ) || ! Number.isFinite( roof.y1 ) || roof.y1 <= roof.y0 ) return null;
	_roofs.set( id, { cz: 0, yaw: 0, ...roof } );
	return _roofs.get( id );

}

export const roofs = () => _roofs;
export const clearRoofs = () => _roofs.clear();
