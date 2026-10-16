#!/bin/sh
# Wave 25F captures (headless Dawn): the idle variety, the rain's oilskins and held umbrellas, the wedding couple, the fish auction.
#   sh tools/life25f/capture-w25.sh [tag] [dawnDir]
TAG=${1:-after}
DAWN=${2:-C:/Users/mario/AppData/Local/Temp/dawn}
OUT=tools/life25f/out
cap() { node tools/life/capture.mjs --dawn=$DAWN --out=$OUT --tag=$TAG "$@"; }

# idle variety: the markets at noon
cap --only=home,tidemark --times=12.5 --frames=300 > $OUT/$TAG-clear.log 2>&1
# the rain
cap --only=home,tidemark --times=12.5 --weather=rain --frames=300 > $OUT/$TAG-rain.log 2>&1
# the auction (the crowd is put at its places at once: a minute of walking is not rendered)
cap --only=tidemark --times=15.5 --frames=240 --tag=$TAG-auction --pose='{"x":1833.5,"y":2.3,"z":67.5,"look":{"x":1846,"z":62.5},"pitch":-0.08}' \
  --eval='const s=tl.sims.tidemark; let k=0; const u=tl.update.bind(tl); tl.update=(dt)=>{ u(dt); if(++k===150){ tl.startEvent("auction","tidemark"); const A=s.auc; if(A){ for(const c of A.members){ c.x=c.goal.x; c.z=c.goal.z; c.path=null; c.pending=null; c.moving=false; s._arrive(c);} A.stage="bidding"; } } };' > $OUT/$TAG-auction.log 2>&1
# the wedding (the couple and the party at the procession's first leg)
cap --only=tidemark --times=16.2 --frames=240 --tag=$TAG-wedding --pose='{"x":1866,"y":2.4,"z":2,"look":{"x":1858,"z":-3.5},"pitch":-0.05}' \
  --eval='const s=tl.sims.tidemark; let k=0; const u=tl.update.bind(tl); tl.update=(dt)=>{ u(dt); if(++k===150){ tl.startEvent("procession","tidemark"); const E=s.event; if(E){ for(const c of E.members){ c.x=c.goal.x; c.z=c.goal.z; c.path=null; c.pending=null; c.moving=false; s._arrive(c);} } } };' > $OUT/$TAG-wedding.log 2>&1
