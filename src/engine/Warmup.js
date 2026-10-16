import { GPU } from './gpu/GPU.js';

// The first view after the main menu (wave 25A). The pipelines compile behind the menu (App.init deferCompile); when the
// player has chosen, the frames of the chosen spot run behind the loader until one frame draws everything it wants:
// MeshRenderer moves every pipeline a draw waits for to the head of the compile queue and counts the draws it skipped
// (waitingIn). The rest of the world keeps compiling in the background while the game runs.
//
//   const r = await warmView( app, { onProgress: ( s ) => ui.setLoadingDetail( s.ready, s.needed ) } );
//   r: { ms, frames, waited }   (waited: the draws still waiting when it gave up after maxMs; 0 = complete)
//
// The frames step the clock by `dt` (1 ms: the intro glide and the day barely move while the loader is up).

const tick = ( ms ) => new Promise( ( r ) => setTimeout( r, ms ) );

export async function warmView( app, { onProgress = null, maxMs = 120000, dt = 1e-3, settle = 3 } = {} ) {

	const mr = app.engine.meshRenderer;
	const st = GPU.pipelineStats;
	const t0 = performance.now();
	// every frame dispatches the simulation kernels and the post passes, and one not compiled yet compiles on the main
	// thread (GPU.ready): those go first and the frames wait for them
	const frameOwn = ( h ) => ! h.mesh;
	GPU.prioritizeWhere( frameOwn );
	await GPU.pipelinesReady( frameOwn );
	let clean = 0, frames = 0, waiting = 0, peak = 0;
	while ( performance.now() - t0 < maxMs ) {

		const lastDone = st.done;
		app.frame( dt );
		const f = GPU.frame;
		await GPU.queue.onSubmittedWorkDone();
		frames ++;
		waiting = mr.waitingIn( f );
		peak = Math.max( peak, waiting );
		if ( onProgress ) try { onProgress( { waiting, needed: peak, ready: peak - waiting, done: st.done, requested: st.requested, frames } ); } catch ( e ) { /* the loader only */ }
		if ( waiting === 0 ) {

			if ( ++ clean >= settle ) break;
			continue;

		}

		clean = 0;
		// nothing new to draw until a compile lands: wait for one (the page keeps painting the loader meanwhile)
		const until = performance.now() + 250;
		while ( st.done === lastDone && performance.now() < until ) await tick( 16 );

	}

	return { ms: performance.now() - t0, frames, waited: waiting };

}

// compile progress for a status line: { done, requested, fraction }
export function compileProgress() {

	const st = GPU.pipelineStats;
	return { done: st.done, requested: st.requested, fraction: st.requested ? st.done / st.requested : 1 };

}
