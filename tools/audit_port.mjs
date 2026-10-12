import fs from 'node:fs';
import {Simulation} from '../src/simulation.js';
import {PROFILES,CHAPTERS} from '../src/campaign.js';
const manifest=JSON.parse(fs.readFileSync(new URL('../public/assets/manifest.json',import.meta.url)));
const rooms=[];
for(const entry of manifest.rooms){
  const raw=JSON.parse(fs.readFileSync(new URL('../public/assets/rooms/'+entry.id+'.json',import.meta.url)));
  const sim=new Simulation(manifest,raw,PROFILES[0]);
  const reachable=sim.enemies.filter(e=>sim.navigation.path(sim.player,e).length>0||Math.hypot(e.x-sim.player.x,e.y-sim.player.y)<12).length;
  rooms.push({id:entry.id,enemies:sim.total,reachableEnemies:reachable,entities:raw.instances.length,tiles:raw.tiles.length,
    spawn:{x:sim.player.x,y:sim.player.y},exit:{x:sim.exit.x,y:sim.exit.y},sourceScriptsExecuted:false});
}
const report={imported:manifest.stats,campaignChapters:CHAPTERS.length,profiles:PROFILES.length,
  campaignRooms:[...new Set(CHAPTERS.flatMap(c=>c.rooms))].length,
  limitations:['GML is archived, not interpreted. Gameplay is explicitly rewritten in JavaScript.',
    'Special bosses are generic combat entities. Original scripted phases and cutscenes are not ported.',
    'Doors currently use a simplified open/closed collision model and source story locks are released.',
    'Eight custom graphic sheets replace hero walk/punch, armed/unarmed officers, corpses, escape car, streamer desk, and floor atlas; other art remains original.',
    'Campaign chapters use adapted briefing text instead of original story event graphs.',
    'Reachability is a geometry audit, not proof that every full level can be completed.'],rooms};
fs.mkdirSync(new URL('../docs/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('../docs/port-audit.json',import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify({imported:report.imported,campaignRooms:report.campaignRooms,profiles:report.profiles,
  unreachable:rooms.filter(r=>r.reachableEnemies<r.enemies).map(r=>({id:r.id,enemies:r.enemies,reachable:r.reachableEnemies}))},null,2));
