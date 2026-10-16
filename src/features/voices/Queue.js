// Subtitle queue (wave 27): one caption on screen at a time. A line that arrives while another is showing waits its turn
// (a speaker never talks over himself or over another speaker); lines that waited too long are dropped, and the waiting
// list is short, so the captions never fall behind the voices. Pure logic with an injected clock.
//
//   const q = new SubtitleQueue( { maxWaiting: 2, maxWait: 6000 } )
//   q.add( item, now ) -> item | null     the item to show now, or null when it was queued
//   q.finish( now )    -> item | null     the showing line ended: the next waiting one (or null)

export class SubtitleQueue {

	constructor( { maxWaiting = 2, maxWait = 6000 } = {} ) {

		this.maxWaiting = maxWaiting;
		this.maxWait = maxWait;
		this.active = null;
		this.waiting = [];
		this.dropped = 0;

	}

	add( item, now = 0 ) {

		if ( ! this.active ) { this.active = item; return item; }
		this.waiting.push( { item, at: now } );
		while ( this.waiting.length > this.maxWaiting ) { this.waiting.shift(); this.dropped ++; }
		return null;

	}

	finish( now = 0 ) {

		this.active = null;
		while ( this.waiting.length ) {

			const w = this.waiting.shift();
			if ( now - w.at > this.maxWait ) { this.dropped ++; continue; }
			this.active = w.item;
			return w.item;

		}

		return null;

	}

	clear() {

		this.active = null;
		this.waiting.length = 0;

	}

}
