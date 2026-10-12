# Procedural fishing clips for the 48-bone Hyptile rig (Blender, background). The authored Fishing_Hold /
# Fishing_Reel / Fishing_Strike were static arm poses with the rod hanging up the leg; these replace them (same
# names) and add Fishing_Fight and Fishing_Charge. They play as an UPPER-BODY OVERLAY in the game (src/player/
# Avatar.js, SkinnedModel.setOverlay: spine_01 x 0.5, spine_02 x 0.8, clavicles / arms / neck / head x 1) over the
# locomotion, so everything here lives above the pelvis; the legs and pelvis stay at rest in the clips.
#
#   make_fishing_clips( arm ) -> { name: action }, actions have fake users, frames 1 .. n at 30 fps
#
# No constraints and no runtime IK: the pose of every frame is computed here in plain Python (forward kinematics
# over the rest matrices) and baked as ordinary FK keys on every bone. Per frame:
#   1. the torso (spine, neck, head, clavicles) is rotated by world-axis Euler angles about each bone's head;
#   2. the rod frame (shaft d, reel direction r) is built from pitch / cant / yaw and the right hand is put on it with a
#      fixed grip (the hand's long axis 45 deg off the shaft, thumb toward the tip, palm toward the rod);
#   3. the left hand either grips the rod (mirrored grip, `la` along the shaft) or the crank knob (`lk` blends);
#   4. each arm is solved analytically (two bones, law of cosines, the elbow toward a hint point). The upper arm's roll
#      is searched so the twist is spread over shoulder / elbow / wrist instead of piling up in one joint;
#   5. the rod socket weapon_r is keyed too: it is the rod frame itself, placed on the palm (rotation AND translation: the
#      engine's overlay blends both, so the rod sits in the hand whatever the legs are doing).
#
# Timing contract (src/game/FishingRod.js): the bobber leaves the tip 0.09 s after rod.release(), and Fishing_Cast starts the
# frame the rod enters 'flick', so the rod must pass the release angle (about 30-40 deg above horizontal in front) 0.09 s into
# the clip: the whip runs from the back swing (about 128 deg) to it in 3 frames, then follows through toward the water.
# test/avatar-overlay.mjs checks the angles on the exported GLB (test/clip-rod.mjs prints them per frame).
#
# Frames of reference: armature space, +Z up, the character faces -Y, its right hand is -X. weapon_r has +Z along the
# rod shaft toward the tip and +Y toward the reel (the engine's anchor in FishingRod.js). Hand bones on this rig are NOT
# mirrored: local +Y runs wrist -> fingers, +Z is the palm normal, +X the thumb side on the right hand and the pinky
# side on the left hand (so the left grip is the right grip mirrored with the sign of X flipped).
#
# Debug: every clip prints a FISHING line (reach error, elbow bend, wrist flexion, twist per joint).
import bpy, math, os
from mathutils import Matrix, Vector, Quaternion

FPS = 30
I4 = Matrix.Identity( 4 )
PALM = Vector(( 0.0, 0.055, 0.02 ))  # the rod axis point inside the hand, in hand-local axes (wrist -> fingers, palm normal)
GRIP_ALPHA = math.radians( 48 )       # angle between the shaft and the hand's long axis, toward the thumb (right hand)
GRIP_ALPHA_L = math.radians( 48 )     # the left hand's
REEL_ALONG, REEL_DOWN, KNOB_SIDE, KNOB_R = - 0.078, 0.092, 0.07, 0.06  # reel centre / crank knob relative to the grip (FishingRod.js)

def cols( a, b, c ):
    return Matrix((( a.x, b.x, c.x ), ( a.y, b.y, c.y ), ( a.z, b.z, c.z )))

def euler( rx, ry, rz ):
    # a rotation about the world axes: X pitches forward (+), Y leans left (+), Z turns left (+), degrees
    return Matrix.Rotation( math.radians( rz ), 3, 'Z' ) @ Matrix.Rotation( math.radians( ry ), 3, 'Y' ) @ Matrix.Rotation( math.radians( rx ), 3, 'X' )

def twist_y( q ):
    # angle of the rotation about the bone's own Y axis (swing-twist), -pi..pi
    a = 2.0 * math.atan2( q.y, q.w )
    while a > math.pi: a -= math.tau
    while a < - math.pi: a += math.tau
    return a

def rot_about( axis, ang ):
    return Matrix.Rotation( ang, 3, axis )

def rod_frame( pitch, cant, yaw, roll=0.0 ):
    # shaft d, reel direction r, lateral x = r x d. pitch: elevation in the vertical plane through the heading (0 = forward,
    # 90 = up, 125 = tip back over the shoulder); cant: the plane leant to the right (the tip toward -X); yaw: the heading turned right
    p = math.radians( pitch )
    d = Vector(( 0, - math.cos( p ), math.sin( p ) ))
    r = Vector(( 0, - math.sin( p ), - math.cos( p ) ))
    Rm = rot_about( 'Z', - math.radians( yaw ) ) @ rot_about( 'Y', - math.radians( cant ) )
    d, r = Rm @ d, Rm @ r
    if roll: r = rot_about_axis( d, math.radians( roll ) ) @ r
    x = r.cross( d ).normalized()
    return d, r, x

def rot_about_axis( axis, ang ):
    return Matrix.Rotation( ang, 3, axis.normalized() )

# ---- the pose vector: flat scalars, interpolated per key
DEF = dict(
    pitch = 40.0, cant = 6.0, yaw = 0.0, roll = 0.0,             # the rod
    px = - 0.22, py = - 0.26, pz = 0.93,                          # the rod axis point in the right palm
    rhx = - 0.32, rhy = 0.10, rhz = 0.80,                         # right elbow hint (the elbow lies toward it)
    lhx = 0.30, lhy = 0.0, lhz = 0.85,                            # left elbow hint
    la = - 0.28, lr = 0.0, lx = 0.0,                              # left grip on the rod: along the shaft from the right palm (- = toward the butt), toward the reel, lateral
    lk = 1.0, crank = 0.0,                                        # 1 = left hand on the crank knob, 0 = on the rod; crank phase in turns
    rcurl = 1.0, lcurl = 0.9,
    sp1x = 0.0, sp1y = 0.0, sp1z = 0.0, sp2x = 0.0, sp2y = 0.0, sp2z = 0.0,   # torso
    nkx = 0.0, nky = 0.0, nkz = 0.0, hdx = 0.0, hdy = 0.0, hdz = 0.0,          # neck, head
    crx = 0.0, cry = 0.0, crz = 0.0, clx = 0.0, cly = 0.0, clz = 0.0,          # clavicles (right, left)
)

def pose( **kw ):
    p = dict( DEF )
    for k, v in kw.items():
        if k not in p: raise KeyError( 'unknown pose key ' + k )
        p[ k ] = v
    return p

def ease( a ):
    a = max( 0.0, min( 1.0, a ) )
    return a * a * ( 3 - 2 * a )

def track( keys ):
    # keys: [ ( t, pose ) ] -> f( t ): cubic Hermite per scalar with finite-difference tangents (zero at both ends: the clip
    # starts and ends at rest), so a key that sits between faster neighbours is passed at speed
    keys = sorted( keys, key = lambda k: k[ 0 ] )
    ts = [ k[ 0 ] for k in keys ]
    def f( t ):
        if t <= ts[ 0 ]: return dict( keys[ 0 ][ 1 ] )
        if t >= ts[ -1 ]: return dict( keys[ -1 ][ 1 ] )
        i = max( j for j in range( len( ts ) - 1 ) if ts[ j ] <= t )
        t0, t1 = ts[ i ], ts[ i + 1 ]
        h = t1 - t0
        u = ( t - t0 ) / h
        h00, h10, h01, h11 = 2 * u**3 - 3 * u**2 + 1, u**3 - 2 * u**2 + u, - 2 * u**3 + 3 * u**2, u**3 - u**2
        out = {}
        for k in DEF:
            p0, p1 = keys[ i ][ 1 ][ k ], keys[ i + 1 ][ 1 ][ k ]
            m0 = 0.0 if i == 0 else ( p1 - keys[ i - 1 ][ 1 ][ k ] ) / ( t1 - ts[ i - 1 ] )
            m1 = 0.0 if i + 2 >= len( ts ) else ( keys[ i + 2 ][ 1 ][ k ] - p0 ) / ( ts[ i + 2 ] - t0 )
            out[ k ] = h00 * p0 + h10 * h * m0 + h01 * p1 + h11 * h * m1
        return out
    return f

def make_fishing_clips( arm, specs=None ):
    bones = arm.pose.bones
    rest = { b.name: b.matrix_local.copy() for b in arm.data.bones }
    parent = { b.name: b.parent.name if b.parent else None for b in arm.data.bones }
    order = []
    def visit( n ):
        order.append( n )
        for c in arm.data.bones:
            if parent[ c.name ] == n: visit( c.name )
    for b in arm.data.bones:
        if parent[ b.name ] is None: visit( b.name )
    REL = { n: ( rest[ n ] if parent[ n ] is None else rest[ parent[ n ] ].inverted() @ rest[ n ] ) for n in order }
    R3 = { n: rest[ n ].to_3x3() for n in order }
    RR = lambda a, b: R3[ a ].inverted() @ R3[ b ]  # rest rotation of b relative to a

    def fk( L, fixed ):
        # armature-space matrices from pose-basis matrices L (bone local space, default identity); `fixed` pins bones
        F = {}
        for n in order:
            if n in fixed: F[ n ] = fixed[ n ]
            else:
                base = rest[ n ] if parent[ n ] is None else F[ parent[ n ] ] @ REL[ n ]
                F[ n ] = base @ L.get( n, I4 )
        return F

    def conj( bn, D ):
        # the pose rotation of bone bn that rotates it by the world rotation D about its head
        Rr = R3[ bn ]
        return ( Rr.inverted() @ D @ Rr ).to_4x4()

    # hand grip frames in hand coordinates (columns = rod x, reel direction, shaft). Right: shaft 48 deg off the long axis
    # toward the thumb, the reel on the far side, the palm toward the rod. Left: the mirror image (the X axis flips)
    ca, sa = math.cos( GRIP_ALPHA ), math.sin( GRIP_ALPHA )
    G_R = cols( Vector(( 0, 0, - 1 )), Vector(( - ca, sa, 0 )), Vector(( sa, ca, 0 )) )
    cl, sl = math.cos( GRIP_ALPHA_L ), math.sin( GRIP_ALPHA_L )
    G_L = cols( Vector(( 0, 0, 1 )), Vector(( cl, sl, 0 )), Vector(( - sl, cl, 0 )) )
    G_R_inv, G_L_inv = G_R.inverted(), G_L.inverted()

    class Arm:
        def __init__( self, s ):
            self.s = s
            self.clav, self.up, self.lo, self.hd = f'clavicle_{s}', f'upperarm_{s}', f'lowerarm_{s}', f'hand_{s}'
            self.l1 = ( rest[ self.lo ].translation - rest[ self.up ].translation ).length
            self.l2 = ( rest[ self.hd ].translation - rest[ self.lo ].translation ).length
            self.ro = 0.0
            self.stat = dict( reach = 0.0, bend_min = 9.0, bend_max = 0.0, wrist = 0.0, ts = 0.0, te = 0.0, tw = 0.0 )

        def elbow( self, S, W, hint ):
            v = W - S
            d = v.length
            u = v / max( d, 1e-6 )
            dc = max( abs( self.l1 - self.l2 ) + 0.01, min( self.l1 + self.l2 - 0.002, d ) )
            a = ( self.l1 ** 2 + dc ** 2 - self.l2 ** 2 ) / ( 2 * dc )
            h = math.sqrt( max( 0.0, self.l1 ** 2 - a ** 2 ) )
            hv = hint - S
            hv -= u * hv.dot( u )
            if hv.length < 1e-6: hv = u.cross( Vector(( 0, 0, 1 )) )
            hv.normalize()
            return S + u * a + hv * h, S + u * dc, d - dc

        def solve( self, F, W, O, hint ):
            # F: armature matrices with the torso posed (clavicle valid); W: wrist target, O: hand orientation (3x3)
            base_up = F[ self.clav ] @ REL[ self.up ]
            S = base_up.translation
            E, Wc, err = self.elbow( S, W, hint )
            y1, y2 = ( E - S ).normalized(), ( Wc - E ).normalized()
            Ru_ref = base_up.to_3x3()
            Rsw1 = Ru_ref.col[ 1 ].normalized().rotation_difference( y1 ).to_matrix()
            RuA = Rsw1 @ Ru_ref
            relL, relH = RR( self.up, self.lo ), RR( self.lo, self.hd )
            best = None
            for k in range( 72 ):
                rho = math.radians( k * 5.0 - 180.0 )
                Ru = rot_about_axis( y1, rho ) @ RuA
                ts = twist_y( ( Ru_ref.inverted() @ Ru ).to_quaternion() )
                Rl_ref = Ru @ relL
                Rl = Rl_ref.col[ 1 ].normalized().rotation_difference( y2 ).to_matrix() @ Rl_ref
                te = twist_y( ( Rl_ref.inverted() @ Rl ).to_quaternion() )
                tw = twist_y( ( ( Rl @ relH ).inverted() @ O ).to_quaternion() )
                dr = ( ( math.degrees( rho ) - self.ro + 180 ) % 360 ) - 180
                cost = ts ** 2 + 0.6 * ( te + tw ) ** 2 + 1e-5 * dr ** 2
                if best is None or cost < best[ 0 ]: best = ( cost, rho, Ru, Rl, ts, te, tw )
            _, rho, Ru, Rl, ts, te, tw = best
            self.ro = math.degrees( rho )
            phi = ( tw - te ) / 2.0  # forearm roll takes half of what is left between elbow and wrist
            Rl = rot_about_axis( y2, phi ) @ Rl
            Rl_ref = Ru @ relL
            te = twist_y( ( Rl_ref.inverted() @ Rl ).to_quaternion() )
            tw = twist_y( ( ( Rl @ relH ).inverted() @ O ).to_quaternion() )
            st = self.stat
            st[ 'reach' ] = max( st[ 'reach' ], err )
            bend = math.degrees( math.acos( max( - 1.0, min( 1.0, y1.dot( y2 ) ) ) ) )
            st[ 'bend_min' ], st[ 'bend_max' ] = min( st[ 'bend_min' ], bend ), max( st[ 'bend_max' ], bend )
            st[ 'wrist' ] = max( st[ 'wrist' ], math.degrees( math.acos( max( - 1.0, min( 1.0, y2.dot( O.col[ 1 ] ) ) ) ) ) )
            st[ 'ts' ], st[ 'te' ], st[ 'tw' ] = max( st[ 'ts' ], abs( math.degrees( ts ) ) ), max( st[ 'te' ], abs( math.degrees( te ) ) ), max( st[ 'tw' ], abs( math.degrees( tw ) ) )
            T = lambda v: Matrix.Translation( v )
            return { self.up: T( S ) @ Ru.to_4x4(), self.lo: T( E ) @ Rl.to_4x4(), self.hd: T( Wc ) @ O.to_4x4() }, E

    armR, armL = Arm( 'r' ), Arm( 'l' )
    TORSO = ( ( 'spine_01', 'sp1' ), ( 'spine_02', 'sp2' ), ( 'neck_01', 'nk' ), ( 'head', 'hd' ), ( 'clavicle_r', 'cr' ), ( 'clavicle_l', 'cl' ) )
    FINGERS = ( ( 'index', 70 ), ( 'middle', 80 ), ( 'ring', 85 ), ( 'thumb', 40 ) )

    def build( s ):
        # one frame: pose dict -> armature-space matrices of every bone
        L = {}
        for bn, k in TORSO:
            if bn in rest: L[ bn ] = conj( bn, euler( s[ k + 'x' ], s[ k + 'y' ], s[ k + 'z' ] ) )
        for side, amt in ( ( 'r', s[ 'rcurl' ] ), ( 'l', s[ 'lcurl' ] ) ):
            for f, a in FINGERS:
                for j in ( '01', '02', '03' ):
                    n = f'{ f }_{ j }_{ side }'
                    if n in rest: L[ n ] = Quaternion(( 1, 0, 0 ), math.radians( a * amt * ( 0.8 if j == '03' else 1.0 ) ) ).to_matrix().to_4x4()
        F = fk( L, {} )  # the torso posed, arms still at rest
        d, r, x = rod_frame( s[ 'pitch' ], s[ 'cant' ], s[ 'yaw' ], s[ 'roll' ] )
        M = cols( x, r, d )
        P = Vector(( s[ 'px' ], s[ 'py' ], s[ 'pz' ] ))
        # right hand: on the rod
        O_r = M @ G_R_inv
        W_r = P - O_r @ PALM
        fixed, _ = armR.solve( F, W_r, O_r, Vector(( s[ 'rhx' ], s[ 'rhy' ], s[ 'rhz' ] )) )
        # left hand: on the rod (mirrored grip) and / or on the crank knob
        hint_l = Vector(( s[ 'lhx' ], s[ 'lhy' ], s[ 'lhz' ] ))
        lk = s[ 'lk' ]
        W_l = O_l = None
        if lk < 1.0:
            Pl = P + d * s[ 'la' ] + r * s[ 'lr' ] + x * s[ 'lx' ]
            O_rod = M @ G_L_inv
            W_rod = Pl - O_rod @ PALM
        if lk > 0.0:
            ph = s[ 'crank' ] * math.tau
            C = P + d * REEL_ALONG + r * REEL_DOWN
            knob = C - x * KNOB_SIDE + ( d * math.cos( ph ) + r * math.sin( ph ) ) * KNOB_R
            S_l = ( F[ armL.clav ] @ REL[ armL.up ] ).translation
            W_k = knob
            for _ in range( 2 ):
                E_l, _, _ = armL.elbow( S_l, W_k, hint_l )
                fy = ( W_k - E_l ).normalized()
                zh = ( C - knob )
                zh -= fy * zh.dot( fy )
                zh = zh.normalized() if zh.length > 1e-6 else x
                O_k = cols( fy.cross( zh ), fy, zh )
                W_k = knob - O_k @ PALM
        if lk >= 1.0: W_l, O_l = W_k, O_k
        elif lk <= 0.0: W_l, O_l = W_rod, O_rod
        else:
            W_l = W_rod.lerp( W_k, lk )
            O_l = O_rod.to_quaternion().slerp( O_k.to_quaternion(), lk ).to_matrix()
        fixed_l, _ = armL.solve( F, W_l, O_l, hint_l )
        fixed.update( fixed_l )
        # the rod socket is the rod frame at the right palm
        fixed[ 'weapon_r' ] = Matrix.Translation( P ) @ M.to_4x4()
        return fk( L, fixed )

    out = {}
    for name, spec in ( specs or SPECS ).items():
        n_frames = int( round( spec[ 'dur' ] * FPS ) ) + 1  # loops end on their first pose (the engine wraps at the duration)
        armR.ro = armL.ro = 0.0
        armR.stat = dict( reach = 0.0, bend_min = 999.0, bend_max = 0.0, wrist = 0.0, ts = 0.0, te = 0.0, tw = 0.0 )
        armL.stat = dict( armR.stat )
        frames = [ build( spec[ 'fn' ]( i / FPS ) ) for i in range( n_frames ) ]
        out[ name ] = frames
        print( 'FISHING', name, f'frames={ n_frames }',
            ' R reach=%.3f bend=%.0f..%.0f wrist=%.0f twist s/e/w=%.0f/%.0f/%.0f' % ( armR.stat[ 'reach' ], armR.stat[ 'bend_min' ], armR.stat[ 'bend_max' ], armR.stat[ 'wrist' ], armR.stat[ 'ts' ], armR.stat[ 'te' ], armR.stat[ 'tw' ] ),
            '| L reach=%.3f bend=%.0f..%.0f wrist=%.0f twist s/e/w=%.0f/%.0f/%.0f' % ( armL.stat[ 'reach' ], armL.stat[ 'bend_min' ], armL.stat[ 'bend_max' ], armL.stat[ 'wrist' ], armL.stat[ 'ts' ], armL.stat[ 'te' ], armL.stat[ 'tw' ] ) )
    if os.environ.get( 'FISHING_DUMP' ):
        dump( out )

    # write plain FK keys from the computed matrices
    arm.animation_data_create()
    actions = {}
    for name, frames in out.items():
        act = bpy.data.actions.new( name )
        act.use_fake_user = True
        arm.animation_data.action = act
        prev = {}
        for i, F in enumerate( frames ):
            fr = i + 1
            for n in order:
                pb = bones[ n ]
                base = rest[ n ] if parent[ n ] is None else F[ parent[ n ] ] @ REL[ n ]
                bm = base.inverted() @ F[ n ]
                q = bm.to_quaternion()
                if n in prev and prev[ n ].dot( q ) < 0: q = - q
                prev[ n ] = q
                pb.rotation_quaternion = q
                pb.location = bm.to_translation()
                pb.keyframe_insert( 'rotation_quaternion', frame=fr )
                pb.keyframe_insert( 'location', frame=fr )
        actions[ name ] = act
    arm.animation_data.action = None
    for b in bones: b.rotation_quaternion = Quaternion(); b.location = Vector()
    return actions

def dump( out ):
    # FISHING_DUMP=1: world positions of the rod socket, elbows and wrists at a few frames, to check by numbers
    for name, frames in out.items():
        for i in range( 0, len( frames ), max( 1, len( frames ) // 6 ) ):
            F = frames[ i ]
            f = lambda n: '(%.2f %.2f %.2f)' % tuple( F[ n ].translation )
            print( 'FDUMP', name, i, 'grip', f( 'weapon_r' ), 'elbowR', f( 'lowerarm_r' ), 'wristR', f( 'hand_r' ), 'elbowL', f( 'lowerarm_l' ), 'wristL', f( 'hand_l' ), 'head', f( 'head' ) )

# ---------------------------------------------------------------- the clips
# Pose conventions: pitch is the rod's elevation in the vertical plane (0 forward, 90 up, > 90 tip back over the shoulder),
# torso angles in degrees: x + = lean forward, y + = lean left, z + = turn left (so a wind-up turns z negative: right shoulder back).

def at( base, **kw ):
    p = dict( base )
    for k, v in kw.items():
        if k not in p: raise KeyError( k )
        p[ k ] = v
    return p

# ready stance: the rod 42 deg up, the right fist at the hip in front of the belly, elbows bent, the left hand on the crank
HOLD = pose( pitch = 42, cant = 6, px = - 0.19, py = - 0.22, pz = 0.95, rhx = - 0.34, rhy = 0.12, rhz = 0.78, lhx = 0.30, lhy = 0.02, lhz = 0.85,
    sp1x = 1, sp1z = - 4, sp2x = 1, sp2z = - 5, hdx = 6, hdz = 8, rcurl = 1.0, lcurl = 0.9 )

def hold( t ):
    k = math.sin( t / 3.0 * math.tau )
    p = dict( HOLD )
    p[ 'pitch' ] += 1.0 * k
    p[ 'pz' ] += 0.005 * k
    p[ 'sp2x' ] += 0.6 * k
    p[ 'hdx' ] += 0.8 * k
    return p

# rod swung back over the right shoulder, tip behind and out to the right, the left hand on the butt, the torso turned right and leaning back
BACK = at( HOLD, pitch = 130, cant = 14, px = - 0.35, py = 0.06, pz = 1.27, rhx = - 0.48, rhy = - 0.12, rhz = 1.02,
    lk = 0.0, la = - 0.26, lhx = 0.14, lhy = - 0.02, lhz = 0.86,
    sp1x = - 7, sp1y = 3, sp1z = - 9, sp2x = - 10, sp2y = 3, sp2z = - 13, nkx = - 2, nkz = 4, hdx = 2, hdz = 14, cry = 10, clz = - 22 )
MID = at( HOLD, pitch = 90, cant = 11, px = - 0.26, py = - 0.12, pz = 1.1, rhx = - 0.40, rhy = 0.0, rhz = 0.88,
    lk = 0.3, la = - 0.24, lhx = 0.2, lhy = 0.0, lhz = 0.85,
    sp1x = - 3, sp1y = 1, sp1z = - 5, sp2x = - 4, sp2y = 1, sp2z = - 7, hdx = 4, hdz = 8, cry = 5, clz = - 12 )
# the whip: through here the rod passes the release angle
REL_ = at( HOLD, pitch = 29, cant = 4, px = - 0.22, py = - 0.31, pz = 1.03, rhx = - 0.36, rhy = 0.04, rhz = 0.86,
    lk = 0.0, la = - 0.24, lhx = 0.22, lhy = 0.04, lhz = 0.84,
    sp1x = 2, sp1z = 4, sp2x = 4, sp2z = 6, hdx = 0, hdz = - 5, clz = - 10 )
FOLLOW = at( HOLD, pitch = - 8, cant = 2, px = - 0.20, py = - 0.37, pz = 0.99, rhx = - 0.34, rhy = 0.08, rhz = 0.82,
    lk = 0.5, la = - 0.24, sp1x = 3, sp1z = 4, sp2x = 6, sp2z = 6, hdx = 3, hdz = - 5, clz = - 4 )

def charge( t ):
    return track( [ ( 0.0, HOLD ), ( 0.24, MID ), ( 0.5, BACK ), ( 0.7, at( BACK, pitch = 127, py = 0.05 ) ) ] )( t )

_cast = track( [
    ( 0.0, at( BACK, pitch = 127, py = 0.05 ) ), ( 0.035, at( MID, pitch = 106, py = - 0.05, pz = 1.2, sp1x = - 4, sp2x = - 5, sp2z = - 8 ) ), ( 0.07, at( MID, pitch = 62, py = - 0.2, pz = 1.12, sp1x = 0, sp2x = 1, sp2z = - 1, lk = 0.0 ) ),
    ( 0.1, REL_ ), ( 0.16, at( REL_, pitch = 14, py = - 0.35, pz = 1.0, sp1x = 4, sp2x = 7, sp2z = 8 ) ), ( 0.45, at( FOLLOW, pitch = 0 ) ), ( 0.75, FOLLOW ),
    ( 1.25, at( HOLD, pitch = 34, lk = 1.0, sp1x = 2, sp2x = 3, hdx = 8 ) ), ( 1.6, HOLD ),
] )
def cast( t ): return _cast( t )

REEL = at( HOLD, pitch = 52, cant = 6, py = - 0.24, pz = 0.97, sp1x = - 1, sp2x = - 2, hdx = 5 )
def reel( t ):
    k = math.sin( t / 2.0 * math.tau )
    p = dict( REEL )
    p[ 'crank' ] = t / 1.0
    p[ 'pitch' ] += 1.5 * k
    p[ 'sp2x' ] += 0.8 * math.sin( t * math.tau )
    p[ 'sp2z' ] += 0.8 * math.sin( t * math.tau + 1.2 )
    p[ 'hdx' ] += 0.6 * k
    return p

FIGHT_LOW = at( HOLD, pitch = 58, cant = 8, px = - 0.21, py = - 0.22, pz = 0.96, rhx = - 0.34, rhy = 0.14, rhz = 0.8,
    sp1x = - 4, sp1z = - 3, sp2x = - 6, sp2z = - 3, hdx = 2, hdz = 4 )
FIGHT_HIGH = at( HOLD, pitch = 80, cant = 10, px = - 0.23, py = - 0.13, pz = 1.07, rhx = - 0.38, rhy = 0.06, rhz = 0.86,
    sp1x = - 8, sp1z = - 6, sp2x = - 12, sp2z = - 7, hdx = - 3, hdz = 6, cry = 4 )
def fight( t ):
    # 2 s: pump the rod up and back, then lower it while winding in
    u = t / 2.0
    lift = ease( u / 0.4 ) if u < 0.4 else 1 - ease( ( u - 0.4 ) / 0.6 )
    p = { k: FIGHT_LOW[ k ] + ( FIGHT_HIGH[ k ] - FIGHT_LOW[ k ] ) * lift for k in DEF }
    p[ 'crank' ] = 0.0 if u < 0.4 else 1.6 * ( u - 0.4 ) / 0.6
    p[ 'sp2x' ] += 0.8 * math.sin( t * math.tau * 2 )
    return p

_strike = track( [ ( 0.0, HOLD ), ( 0.12, at( FIGHT_HIGH, pitch = 76 ) ), ( 0.3, at( FIGHT_HIGH, pitch = 70, px = - 0.22 ) ), ( 0.7, REEL ), ( 1.0, REEL ) ] )
def strike( t ): return _strike( t )

SPECS = {
    'Fishing_Charge': dict( dur = 0.7, loop = False, fn = charge ),
    'Fishing_Cast': dict( dur = 1.6, loop = False, fn = cast ),
    'Fishing_Hold': dict( dur = 3.0, loop = True, fn = hold ),
    'Fishing_Reel': dict( dur = 2.0, loop = True, fn = reel ),
    'Fishing_Fight': dict( dur = 2.0, loop = True, fn = fight ),
    'Fishing_Strike': dict( dur = 1.0, loop = False, fn = strike ),
}
