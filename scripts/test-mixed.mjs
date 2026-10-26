import assert from 'node:assert/strict';
import {makeMixed,addMixed,finishRotation,standings,mixedId} from '../app/mixed.ts';
import {gameOver} from '../app/engine.ts';
const {category,matches}=makeMixed();
assert.equal(matches.length,33);assert.equal(category.teams.length,22);
for(const name of category.teams)assert.equal(matches.filter(m=>[...m.playersA,...m.playersB].includes(name)).length,6,name);
for(let r=0;r<11;r++){
 const round=matches.filter(m=>m.round===r);assert.deepEqual(round.map(m=>m.scheduledCourt),[1,2,3]);
 assert.equal(new Set(round.flatMap(m=>[...m.playersA,...m.playersB])).size,12);
}
assert.equal(matches[0].a,'Kit & Aizem');assert.equal(matches[32].b,'Lhen & Jay');
assert.equal(gameOver({sa:11,sb:10},category),true);assert.equal(gameOver({sa:10,sb:10},category),false);
assert.equal(gameOver({sa:11,sb:10},{target:11}),false);
assert.equal(standings(category,matches).every(r=>r.played===0&&r.rank===1),true);
for(let r=0;r<11;r++){
 const group=matches.filter(m=>m.round===r);assert.equal(group.every(m=>m.status==='ready'),true);
 for(let i=0;i<3;i++){
  const m=group[i];m.sa=11;m.sb=10;m.status='completed';m.winner=m.a;finishRotation(matches,m);
  if(i<2&&r<10)assert.equal(matches.filter(m=>m.round===r+1).every(m=>m.status==='waiting'),true);
 }
}
const rows=standings(category,matches);
assert.equal(rows.every(r=>r.played===6&&r.wins+r.losses===6),true);
assert.equal(rows.reduce((n,r)=>n+r.wins,0),66);assert.equal(rows.reduce((n,r)=>n+r.difference,0),0);
assert.deepEqual(standings(category,matches),rows); // Repeated reads cannot double count wins.
for(let i=1;i<rows.length;i++){
 const a=rows[i-1],b=rows[i];assert.ok(a.wins>b.wins||a.wins===b.wins&&(a.difference>b.difference||a.difference===b.difference&&a.for>=b.for));
 if(a.wins===b.wins&&a.difference===b.difference&&a.for===b.for)assert.equal(a.rank,b.rank);
}
const state={categories:[],matches:[]};assert.equal(addMixed(state),true);assert.equal(addMixed(state),false);assert.equal(state.matches.length,33);
console.log('PASS: exact 22-player/33-game schedule, six games each, no collisions, 11–10 finish, unchanged elimination rules, round gates, individual ranking and idempotent seed.');
