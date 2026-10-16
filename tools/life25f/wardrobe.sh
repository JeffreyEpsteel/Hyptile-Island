#!/bin/sh
# a wardrobe line-up at Tidemark's plaza: bride, groom, oilskins, umbrella (in the rain), a plain citizen
TAG=${1:-wardrobe}
DAWN=${2:-C:/Users/mario/AppData/Local/Temp/dawn}
OUT=tools/life25f/out
node tools/life/capture.mjs --dawn=$DAWN --out=$OUT --tag=$TAG --only=tidemark --times=12.5 --frames=260 --pose='{"x":1835.4,"y":1.9,"z":4.7,"look":{"x":1823.4,"z":-7.3},"pitch":-0.02}' --eval="$(cat tools/life25f/wardrobe.js)" > $OUT/$TAG.log 2>&1
