// Wave 21A: writes Meridian's plan (meridian/CityPlan.js cityPlan()) as JSON for the Blender check render (towers.py).
//   node tools/meridian/plan-json.mjs <out.json>
import { writeFileSync } from 'node:fs';
import { cityPlan } from '../../src/world/islands/meridian/CityPlan.js';

const plan = cityPlan();
writeFileSync( process.argv[ 2 ] || 'meridian-plan.json', JSON.stringify( { center: plan.center, buildings: plan.buildings } ) );
console.log( 'wrote', plan.buildings.length, 'buildings' );
