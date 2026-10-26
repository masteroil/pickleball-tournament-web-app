import { env } from 'cloudflare:workers';
import { getOrganizer } from '../../organizer-auth';
import {makeBracket,rally,advance,gameOver} from '../../engine';
import {addMixed,finishRotation} from '../../mixed';
export const dynamic='force-dynamic';
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const clean=(s:any,owner:boolean)=>({...s,owner:undefined,pinHash:undefined,attempts:undefined,sessions:undefined,isOwner:owner,matches:s.matches.map((m:any)=>({...m,signature:owner?m.signature:undefined,signer:owner?m.signer:undefined}))});
// One-time, fixed deployment seed requested by the organizer. CAS prevents lost scores.
// No caller-supplied data is accepted by this backfill.
async function read(){
 for(let attempt=0;attempt<3;attempt++){
  const row=await env.DB!.prepare('SELECT * FROM tournaments WHERE id = ?').bind('main').first<any>();
  if(!row)return null;
  const s=JSON.parse(row.payload);if(!addMixed(s))return row;
  const payload=JSON.stringify(s);
  const result=await env.DB!.prepare('UPDATE tournaments SET payload=?,revision=revision+1 WHERE id=? AND revision=?').bind(payload,'main',row.revision).run();
  if(result.meta.changes)return {...row,payload,revision:row.revision+1};
 }
 throw Error('Tournament is busy. Please retry.');
}
export async function GET(req:Request){const user=await getOrganizer(req);const row=await read();if(!row)return Response.json({empty:true,isOwner:!!user},{headers:{'Cache-Control':'no-store'}});const s=JSON.parse(row.payload);return Response.json({...clean(s,!!user),revision:row.revision},{headers:{'Cache-Control':'no-store'}});}
export async function POST(req:Request){try{const b:any=await req.json();const user=await getOrganizer(req);const row=await read();if(!row){if(b.action!=='init'||!user)return Response.json({error:'Sign in to initialize your tournament.'},{status:403});const teams=['Island Aces','Kitchen Kings','Dink Dynasty','Palawan Paddlers','Net Ninjas','Coastal Crew','Drop Shot Duo','Baseline Boys'];const id=crypto.randomUUID();const s={owner:user.userId,title:'El Nido Pickleball Open',categories:[{id,name:'Mixed Doubles',method:'sideout',target:11,teams}],matches:makeBracket(id,teams),pinHash:await hash(String(b.pin)),sessions:{},attempts:{},audit:[]};addMixed(s);if(!/^\d{6}$/.test(String(b.pin)))throw Error('Use a six-digit PIN.');await env.DB!.prepare('INSERT OR IGNORE INTO tournaments (id,payload,revision) VALUES (?,?,0)').bind('main',JSON.stringify(s)).run();return Response.json({ok:true});}
const s=JSON.parse(row.payload);const owner=!!user;const revision=row.revision;let extra:any={};const fail=(message:string,status=400)=>Response.json({error:message},{status});
if(b.action==='login'){const court=Number(b.court);if(![1,2,3].includes(court)||!String(b.name||'').trim())throw Error('Enter your name and choose a court.');const key=String(court);const attempts=s.attempts[key]||{count:0,until:0};if(attempts.until>Date.now())return fail('Too many attempts. Try again in five minutes.',429);if(await hash(String(b.pin))!==s.pinHash){s.attempts[key]={count:attempts.count+1,until:attempts.count>=4?Date.now()+300000:0};await env.DB!.prepare('UPDATE tournaments SET payload=?,revision=revision+1 WHERE id=? AND revision=?').bind(JSON.stringify(s),'main',revision).run();return fail('Incorrect PIN.',403);}if(s.sessions[key]?.expires>Date.now())return fail('This court already has an umpire. Ask the organizer to release it.',409);const token=crypto.randomUUID();s.sessions[key]={hash:await hash(token),name:String(b.name).trim().slice(0,80),expires:Date.now()+12*3600000};delete s.attempts[key];extra={token};
}else if(['rally','undo','finish'].includes(b.action)){const m=s.matches.find((m:any)=>m.id===b.match);if(!m||m.status!=='live')throw Error('This match is no longer live.');const session=s.sessions[String(m.court)];if(!session||session.expires<Date.now()||session.hash!==await hash(String(b.token)))return fail('Your umpire session has ended. Scan the court QR again.',403);if(b.revision!==revision)return fail('Score changed. Refresh and try again.',409);const category=s.categories.find((c:any)=>c.id===m.category);if(b.action==='rally'){if(![0,1].includes(b.side))throw Error('Invalid side.');if(gameOver(m,category))throw Error('Match point reached. Confirm the result or undo the last rally.');rally(m,b.side,category.method,category.format);}else if(b.action==='undo'){const previous=m.history.pop();if(previous)Object.assign(m,previous);}else{if(!gameOver(m,category))throw Error(category.winBy===1?'The winner must reach 11 points.':'The winner must reach the target score and lead by two.');if(!String(b.signer||'').trim()||!/^data:image\/png;base64,/.test(b.signature||'')||b.signature.length>150000)throw Error('Winner name and signature are required.');m.winner=m.sa>m.sb?m.a:m.b;m.signature=b.signature;m.signer=String(b.signer).trim().slice(0,80);m.signedAt=new Date().toISOString();m.umpire=session.name;m.status='completed';m.court=null;if(category.competition==='rotation')finishRotation(s.matches,m);else advance(s.matches,m);}
}else{if(!owner)return fail('Organizer access required.',403);if(b.action==='category'||b.action==='editCategory'){
 const name=String(b.name||'').trim();
 const entries=String(b.teams||'').split('\n').map((x:string)=>x.trim()).filter(Boolean).map((line:string)=>{const [name,group,...extra]=line.split('|').map(x=>x.trim());if(extra.length)throw Error('Use Name | Group, one entry per line.');return {name,group:group||''};});
 const teams=entries.map((x:any)=>x.name),groups=entries.map((x:any)=>x.group);
 if(!name||name.length>80||teams.length<2||teams.length>16||teams.some((x:string)=>!x||x.length>80)||groups.some((x:string)=>x.length>40))throw Error('Enter a category name and 2–16 participants. Names: up to 80 characters; groups: up to 40.');
 if(new Set(teams.map((x:string)=>x.toLowerCase())).size!==teams.length)throw Error('Each participant must have a unique name.');
 const format=b.format||'doubles';
 if(!['singles','doubles'].includes(format)||!['rally','sideout'].includes(b.method)||![11,15,21].includes(Number(b.target)))throw Error('Invalid match settings.');
 let id=crypto.randomUUID();
 if(b.action==='editCategory'){
  const previous=s.categories.find((c:any)=>c.id===b.category);
  if(!previous)throw Error('Category not found.');
  if(previous.competition==='rotation')throw Error('Use the mixed schedule roster editor.');
  if(b.revision!==revision)return fail('Tournament changed. Reopen the editor and try again.',409);
  if(s.matches.some((m:any)=>m.category===previous.id&&['live','completed'].includes(m.status)))throw Error('This category has started. Player and bracket edits are locked to protect match records.');
  id=previous.id;s.categories=s.categories.filter((c:any)=>c.id!==id);s.matches=s.matches.filter((m:any)=>m.category!==id);
 }
 s.categories.push({id,name,teams,groups,format,method:b.method,target:Number(b.target)});
 s.matches.push(...makeBracket(id,teams,format));
  }else if(b.action==='editMixed'){
 const c=s.categories.find((c:any)=>c.id===b.category&&c.competition==='rotation');
 if(!c)throw Error('Mixed category not found.');
 if(b.revision!==revision)return fail('Tournament changed. Reopen the editor.',409);
 if(s.matches.some((m:any)=>m.category===c.id&&['live','completed'].includes(m.status)))throw Error('This category has started. Names are locked.');
 const names=String(b.teams||'').split('\n').map(x=>x.trim()).filter(Boolean);
 if(names.length!==c.teams.length||names.some(x=>x.length>80||x.includes('&')||x.includes('|'))||new Set(names.map(x=>x.toLowerCase())).size!==names.length)throw Error('Enter 22 unique names, one per line, without & or |. Keep the same order.');
 const rename=new Map(c.teams.map((name:string,i:number)=>[name,names[i]]));
 for(const m of s.matches.filter((m:any)=>m.category===c.id)){m.playersA=m.playersA.map((p:string)=>rename.get(p));m.playersB=m.playersB.map((p:string)=>rename.get(p));m.a=m.playersA.join(' & ');m.b=m.playersB.join(' & ');}
 c.teams=names;
 }else if(b.action==='assign'){const court=Number(b.court);const m=s.matches.find((x:any)=>x.id===b.match);if(![1,2,3].includes(court)||!m||m.status!=='ready'||s.matches.some((x:any)=>x.court===court&&x.status==='live'))throw Error('Choose a ready match and an available court.');if(m.scheduledCourt&&m.scheduledCourt!==court)throw Error('Use scheduled court '+m.scheduledCourt+'.');m.court=court;m.status='live';}else if(b.action==='release'){delete s.sessions[String(b.court)];}else if(b.action==='title'){if(!String(b.title).trim())throw Error('Enter a tournament name.');s.title=String(b.title).trim().slice(0,100);}else throw Error('Unknown action.');}
s.audit.push({action:b.action,at:new Date().toISOString(),match:b.match||null});const result=await env.DB!.prepare('UPDATE tournaments SET payload=?, revision=revision+1 WHERE id=? AND revision=?').bind(JSON.stringify(s),'main',revision).run();if(!result.meta.changes)return fail('Another update arrived. Please retry.',409);return Response.json({ok:true,...extra});}catch(e:any){return Response.json({error:e.message||'Unable to save.'},{status:400});}}
