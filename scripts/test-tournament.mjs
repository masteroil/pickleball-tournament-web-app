import assert from 'node:assert/strict';
import {makeBracket,rally,advance} from '../app/engine.ts';
const ms=makeBracket('mixed',['A','B','C','D','E','F','G','H']);
assert.equal(ms.length,7);assert.equal(ms.filter(m=>m.status==='ready').length,4);
const m=ms[0];rally(m,1,'sideout');assert.equal(m.serving,1);assert.equal(m.server,1);assert.equal(m.sb,0);
rally(m,1,'sideout');assert.equal(m.sb,1);rally(m,0,'sideout');assert.equal(m.server,2);assert.equal(m.serving,1);rally(m,0,'sideout');assert.equal(m.serving,0);assert.equal(m.server,1);
Object.assign(m,m.history.pop());assert.equal(m.serving,1);assert.equal(m.server,2);
m.winner='A';advance(ms,m);assert.equal(ms[4].a,'A');assert.equal(ms[4].status,'waiting');ms[1].winner='D';advance(ms,ms[1]);assert.equal(ms[4].b,'D');assert.equal(ms[4].status,'ready');
const r=makeBracket('rally',['A','B'])[0];rally(r,1,'rally');assert.equal(r.sb,1);assert.equal(r.serving,1);rally(r,0,'rally');assert.equal(r.sa,1);assert.equal(r.serving,0);
console.log('PASS: bracket generation, opening side-out, second server, side-out, undo, winner advancement, and rally scoring.');

for(let count=2;count<=16;count++){
 const names=Array.from({length:count},(_,i)=>`Player ${i+1}`);
 const bracket=makeBracket('singles',names,'singles');
 const size=2**Math.ceil(Math.log2(count));
 assert.equal(bracket.filter(m=>m.status==='bye').length,size-count);
 assert.equal(bracket.filter(m=>m.status!=='bye').length,count-1);
 assert.deepEqual(bracket.filter(m=>m.round===0).flatMap(m=>[m.a,m.b]).filter(Boolean).sort(),[...names].sort());
 let played=0;
 while(true){const ready=bracket.find(m=>m.status==='ready');if(!ready)break;assert.ok(ready.a&&ready.b);assert.notEqual(ready.a,ready.b);ready.winner=ready.a;ready.status='completed';advance(bracket,ready);played++;}
 assert.equal(played,count-1);assert.equal(bracket.at(-1).status,'completed');
}
const single=makeBracket('s',['A','B'],'singles')[0];
rally(single,1,'sideout','singles');assert.equal(single.serving,1);assert.equal(single.server,1);assert.equal(single.sb,0);
rally(single,1,'sideout','singles');assert.equal(single.sb,1);
rally(single,0,'sideout','singles');assert.equal(single.serving,0);assert.equal(single.server,1);
Object.assign(single,single.history.pop());assert.equal(single.serving,1);assert.equal(single.sb,1);
console.log('PASS: every bracket size from 2–16, byes, complete tournament progression and singles service/undo.');
