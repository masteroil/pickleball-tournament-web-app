export type Match = {id:string; category:string; round:number; index:number; a:string|null; b:string|null; sa:number; sb:number; serving:number; server:number; opening:boolean; court:number|null; status:string; history:any[]; winner?:string; signature?:string; signer?:string; signedAt?:string; umpire?:string};
export function makeBracket(category:string, teams:string[], format='doubles'):Match[]{
 if(teams.length<2||teams.length>16)throw Error('Enter between 2 and 16 participants.');
 const size=2**Math.ceil(Math.log2(teams.length)),byes=size-teams.length;
 const matches:Match[]=[];
 // Spread byes across the first round. Entry order determines bye recipients.
 let cursor=0;
 for(let r=0,count=size/2;count>=1;r++,count/=2){
  for(let i=0;i<count;i++){
   const bye=r===0&&Math.floor((i+1)*byes/(size/2))>Math.floor(i*byes/(size/2));
   const a=r===0?teams[cursor++]:null,b=r===0&&!bye?teams[cursor++]:null;
   matches.push({id:crypto.randomUUID(),category,round:r,index:i,a,b,sa:0,sb:0,serving:0,server:format==='singles'?1:2,opening:true,court:null,status:r===0?(bye?'bye':'ready'):'waiting',history:[],...(bye?{winner:a!}:{})});
  }
 }
 for(const m of matches.filter(m=>m.status==='bye'))advance(matches,m);
 return matches;
}
export function rally(m:Match, side:number, method:string, format='doubles'){
 m.history.push({sa:m.sa,sb:m.sb,serving:m.serving,server:m.server,opening:m.opening});
 if(method==='rally'){side===0?m.sa++:m.sb++;m.serving=side;}
 else if(side===m.serving){side===0?m.sa++:m.sb++;}
 else if(format==='singles'){m.serving=1-m.serving;m.server=1;m.opening=false;}
 else if(m.server===1){m.server=2;}
 else{m.serving=1-m.serving;m.server=1;m.opening=false;}
}
export function advance(matches:Match[],m:Match){const next=matches.find(x=>x.category===m.category&&x.round===m.round+1&&x.index===Math.floor(m.index/2));if(next){if(m.index%2===0)next.a=m.winner!;else next.b=m.winner!;if(next.a&&next.b)next.status='ready';}}
export function gameOver(m:{sa:number;sb:number},c:{target:number;winBy?:number}){return Math.max(m.sa,m.sb)>=c.target&&Math.abs(m.sa-m.sb)>=(c.winBy??2);}
