'use client';
import {standings} from './mixed';
export function MixedStandings({category,matches}:{category:any;matches:any[]}){
 const rows=standings(category,matches),done=matches.filter(m=>m.category===category.id&&m.status==='completed').length;
 return <section className="panel mixedstandings"><span className="tag">INDIVIDUAL STANDINGS</span><h2>{category.name}</h2><p>{done} / 33 matches confirmed · Each winning player earns 1 win.</p><p>Ranked by wins → point difference → points scored. Exact ties share a rank. Only signed, confirmed results count.</p><div className="tableoverflow"><table><thead><tr><th>Rank</th><th>Player</th><th>Played</th><th>Wins</th><th>Losses</th><th>Points for</th><th>Against</th><th>Difference</th></tr></thead><tbody>{rows.map(r=><tr key={r.name}><td>{r.rank}</td><th scope="row">{r.name}</th><td>{r.played} / 6</td><td><strong>{r.wins}</strong></td><td>{r.losses}</td><td>{r.for}</td><td>{r.against}</td><td>{r.difference>0?'+':''}{r.difference}</td></tr>)}</tbody></table></div></section>
}
export function MixedSchedule({category,matches,owner,busy,onAssign}:{category:any;matches:any[];owner:boolean;busy:boolean;onAssign:(m:any)=>void}){
 const games=matches.filter(m=>m.category===category.id);
 return <section className="mixedschedule"><div className="panel"><span className="tag">ROTATING MIXED DOUBLES</span><h2>{category.name}</h2><p>22 players · 11 rounds · 3 courts · 6 games per player</p><p>Side-out scoring · First to 11 · No win by two. Matchups and team averages follow your PDF. Ratings are reference values, not recalculated DUPR ratings.</p></div>{Array.from({length:11},(_,round)=>{
 const group=games.filter(m=>m.round===round),playing=new Set(group.flatMap(m=>[...m.playersA,...m.playersB]));
 const resting=category.teams.filter((p:string)=>!playing.has(p));
 return <section className="panel mixedround" key={round}><h3>Round {round+1} <span className="tag">{group.filter(m=>m.status==='completed').length} / 3 confirmed</span></h3><div className="mixedgames">{group.map(m=>{
 const occupied=matches.some(x=>x.status==='live'&&x.court===m.scheduledCourt);
 return <article className="mixedgame" key={m.id}><div className="sectionheading"><strong>Court {m.scheduledCourt}</strong><span className="tag">{m.status==='completed'?'Confirmed':m.status==='live'?'Live':m.status==='ready'?'Ready':'Upcoming'}</span></div><div className="teamscore"><span>{m.a}<small>DPUR Avg {m.averages[0].toFixed(3)}</small></span><strong>{m.sa}</strong></div><div className="teamscore"><span>{m.b}<small>DPUR Avg {m.averages[1].toFixed(3)}</small></span><strong>{m.sb}</strong></div>{m.status==='completed'&&<p>{m.winner} · +1 win each</p>}{owner&&m.status==='ready'&&<button className="primary full" disabled={busy||occupied} onClick={()=>onAssign(m)}>{occupied?'Court occupied':'Start on court '+m.scheduledCourt}</button>}</article>
 })}</div><p className="resting"><strong>Resting:</strong> {resting.join(', ')}</p></section>
 })}</section>
}
