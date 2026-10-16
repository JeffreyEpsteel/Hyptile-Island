#!/bin/sh
# the fish auction from two sides (the crowd is put at its places at once: a minute of walking is not rendered)
TAG=${1:-auction}
DAWN=${2:-C:/Users/mario/AppData/Local/Temp/dawn}
OUT=tools/life25f/out
EV='const s=tl.sims.tidemark; let k=0; const u=tl.update.bind(tl); tl.update=(dt)=>{ u(dt); if(++k===150){ tl.startEvent("auction","tidemark"); const A=s.auc; if(A){ for(const c of A.members){ c.x=c.goal.x; c.z=c.goal.z; c.path=null; c.pending=null; c.moving=false; s._arrive(c);} A.stage="bidding"; } } };'
node tools/life/capture.mjs --dawn=$DAWN --out=$OUT --tag=$TAG-a --only=tidemark --times=15.5 --frames=240 --pose='{"x":1839,"y":2.2,"z":56.5,"look":{"x":1845.3,"z":63},"pitch":-0.1}' --eval="$EV" > $OUT/$TAG-a.log 2>&1
node tools/life/capture.mjs --dawn=$DAWN --out=$OUT --tag=$TAG-b --only=tidemark --times=15.5 --frames=240 --pose='{"x":1851.5,"y":2.6,"z":58.5,"look":{"x":1844.2,"z":63.4},"pitch":-0.12}' --eval="$EV" > $OUT/$TAG-b.log 2>&1
