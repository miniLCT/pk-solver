import { createRequire } from 'node:module';
import { mkdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import os from 'node:os';
import { evaluate,categoryOf,formatCard,parseCard,calculate } from '../src/poker.js';
import { seededRandom,analyze,exactRiverEV } from '../src/strategy.js';
const require=createRequire(import.meta.url),{Hand}=require('pokersolver'),referenceVersion=require('pokersolver/package.json').version;
const random=seededRandom(20261008);
const deal=n=>{const d=Array.from({length:52},(_,i)=>i);for(let i=0;i<n;i++){const j=i+Math.floor(random()*(52-i));[d[i],d[j]]=[d[j],d[i]];}return d.slice(0,n);};
const hands=Array.from({length:25000},()=>deal(7));
let start=performance.now();const local=hands.map(evaluate),localMs=performance.now()-start;
start=performance.now();const reference=hands.map(h=>Hand.solve(h.map(formatCard))),referenceMs=performance.now()-start;
let categoryMismatches=0;hands.forEach((h,i)=>{if(categoryOf(local[i])!==reference[i].rank-1)categoryMismatches++;});
let winnerMismatches=0;const deals=5000;
for(let i=0;i<deals;i++){
  const players=2+i%7,cards=deal(5+players*2),board=cards.slice(0,5);
  const sets=Array.from({length:players},(_,p)=>[...cards.slice(5+p*2,7+p*2),...board]);
  const scores=sets.map(evaluate),best=Math.max(...scores),ours=scores.flatMap((s,p)=>s===best?[p]:[]);
  const solved=sets.map(h=>Hand.solve(h.map(formatCard))),winners=Hand.winners(solved),theirs=solved.flatMap((h,p)=>winners.includes(h)?[p]:[]);
  if(JSON.stringify(ours)!==JSON.stringify(theirs))winnerMismatches++;
}
const cards=s=>s.split(' ').map(parseCard);
const fixtures=[['As Ks','Qs Js Ts 2h 3h'],['Ah Ad','Kh Qh Jh Th 2s'],['2h 3h','As Ks Qs Js Ts'],['8s 9d','7c 8d 9c Ts Jh']];
const equity=[];
for(const [heroText,boardText] of fixtures){
  const hero=cards(heroText),board=cards(boardText),used=new Set([...hero,...board]);let share=0,total=0;
  const own=Hand.solve([...hero,...board].map(formatCard));
  for(let a=0;a<52;a++)for(let b=a+1;b<52;b++)if(!used.has(a)&&!used.has(b)){
    const opponent=Hand.solve([a,b,...board].map(formatCard)),winners=Hand.winners([own,opponent]);
    share+=winners.includes(own)?1/winners.length:0;total++;
  }
  const result=calculate({hero,board,opponents:[[]],iterations:10000});
  const error=Math.abs(result.players[0].equity-share/total*100);
  equity.push({hero:heroText,board:boardText,localEquity:result.players[0].equity,referenceEquity:share/total*100,absoluteError:error});
}
const trials=30000,base={pot:15,stack:20,toCall:5,position:'ip',profile:'balanced',range:'random',history:[],trials,seed:20261008};
const actionCases=[],strategyComparison=[];start=performance.now();
for(const [hero,board,toCall,position] of [['As Kh','Qs Js Ts 2h 3d',5,'ip'],['Ah Ad','Kh Qh Jh Th 2s',5,'ip'],['8s 8d','Kh 7c 2d Js 3h',0,'oop'],['Kc Qd','Kh 7c 2d Js 3h',0,'oop']]){
  const config={...base,hero:cards(hero),board:cards(board),toCall,position};
  const result=analyze(config);
  const baseline=result.rows.find(row=>row.action.kind===(toCall?'call':'check'));
  const picked=result.rows.reduce((best,row)=>row.policies.value.ev>best.policies.value.ev?row:best,result.rows[0]);
  const baselineEV=exactRiverEV(config,baseline.action,'value'),pickedEV=exactRiverEV(config,picked.action,'value');
  strategyComparison.push({hero,board,baseline:baseline.action.label,baselineEV,picked:picked.action.label,pickedEV,improvement:pickedEV-baselineEV});
  for(const row of result.rows)for(const policy of ['cautious','value','pressure']){
    const exact=exactRiverEV(config,row.action,policy),sampled=row.policies[policy];
    actionCases.push({hero,board,action:row.action.label,policy,exactEV:exact,sampledEV:sampled.ev,ci95:sampled.ci,absoluteError:Math.abs(exact-sampled.ev)});
  }
}
const actionMs=performance.now()-start;
const report={generatedAt:new Date().toISOString(),reference:'https://github.com/goldfire/pokersolver',referenceVersion,environment:{node:process.version,platform:`${process.platform}/${process.arch}`,cpu:os.cpus()[0].model},evaluator:{hands:hands.length,deals,categoryMismatches,winnerMismatches,localMs,referenceMs},equity,action:{trials,cases:actionCases,strategyComparison,elapsedMs:actionMs}};
await mkdir(new URL('../benchmarks/',import.meta.url),{recursive:true});
await writeFile(new URL('../benchmarks/latest.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
const lines=[
'# Reproducible benchmark results','',
`Reference: [goldfire/pokersolver](https://github.com/goldfire/pokersolver), pinned npm version ${referenceVersion} (MIT).`,
`Run: \`npm ci --ignore-scripts && npm run benchmark\`. Seed: 20261008. Environment: ${report.environment.platform}, ${report.environment.node}, ${report.environment.cpu}.`,'',
'## Independent evaluator comparison','',
`- ${hands.length.toLocaleString()} random seven-card hands: **${categoryMismatches} category mismatches**.`,
`- ${deals.toLocaleString()} legal shared-board deals, 2–8 players: **${winnerMismatches} winner/tie mismatches**.`,
`- Evaluating the same ${hands.length.toLocaleString()} hands: local ${localMs.toFixed(1)} ms; reference ${referenceMs.toFixed(1)} ms. This is one local run, not a stable throughput guarantee; the reference returns richer hand objects.`,'',
'## Exact river equity against the independent evaluator','',
'Every scenario enumerates all 990 legal opponent hands.','',
'| Hero | Board | Local equity | Reference equity | Error (percentage points) |','|---|---|---:|---:|---:|',
...equity.map(c=>`| ${c.hero} | ${c.board} | ${c.localEquity.toFixed(6)}% | ${c.referenceEquity.toFixed(6)}% | ${c.absoluteError.toFixed(8)} |`),'',
'## Action-rollout numerical accuracy','',
`Four river scenarios, all legal root actions × three continuation policies. ${trials.toLocaleString()} Monte Carlo samples per action/policy. Reference is exhaustive integration of all legal opponent combinations and all response branches under the **same declared heuristic model**. It is not an independent opponent model or GTO benchmark. Runtime: ${(actionMs/1000).toFixed(2)} s.`,
'','| Hero | Action | Continuation | Exact EV (BB) | Sampled EV (BB) | Approx. 95% ± (BB) | Absolute error (BB) |',
'|---|---|---|---:|---:|---:|---:|',
...actionCases.map(c=>`| ${c.hero} | ${c.action} | ${c.policy} | ${c.exactEV.toFixed(4)} | ${c.sampledEV.toFixed(4)} | ${c.ci95.toFixed(4)} | ${c.absoluteError.toFixed(4)} |`),'',
'## Strategy selection versus a passive baseline','',
'Both use the value-priority continuation policy. Baseline root action is check/call; alternative is selected from Monte Carlo estimates, then both are evaluated by exact integration. Gains apply only against the same heuristic opponent. They are not measured against human players or an equilibrium opponent.','',
'| Hero | Passive root | Exact baseline EV | Selected root | Exact selected EV | Difference (BB) |',
'|---|---|---:|---|---:|---:|',
...strategyComparison.map(c=>`| ${c.hero} | ${c.baseline} | ${c.baselineEV.toFixed(4)} | ${c.picked} | ${c.pickedEV.toFixed(4)} | ${c.improvement.toFixed(4)} |`),'',
'## Interpretation and remaining strategy benchmarks','',
'Zero disagreements in these fixtures support evaluator correctness; they are not an exhaustive proof over all seven-card deals. Exact EV comparison checks rollout sampling and chip accounting under the declared model. Sampling intervals do not capture opponent-model misspecification. These results do not establish real-money profitability or proximity to equilibrium.','',
'For a future CFR module, use [OpenSpiel](https://github.com/google-deepmind/open_spiel) for Kuhn/Leduc game values, exploitability and convergence, and [Desktop Postflop](https://github.com/b-inary/desktop-postflop) / [postflop-solver](https://github.com/b-inary/postflop-solver) for matched heads-up Hold’em ranges, pots, stacks, bet trees and rake. Desktop Postflop notes that open-source development was suspended in October 2023. No CFR/GTO comparison has been run in this version.',''
];
await writeFile(new URL('../benchmarks/REPORT.md',import.meta.url),lines.join('\n'));
console.log(`Evaluator: ${hands.length} hands, ${categoryMismatches} category mismatches; ${deals} deals, ${winnerMismatches} winner mismatches.`);
console.log(`Equity maximum error: ${Math.max(...equity.map(c=>c.absoluteError)).toFixed(8)} percentage points.`);
console.log(`Action EV maximum error: ${Math.max(...actionCases.map(c=>c.absoluteError)).toFixed(4)} BB across ${actionCases.length} comparisons.`);
console.log('Reports: benchmarks/REPORT.md and benchmarks/latest.json');
assert.equal(categoryMismatches,0);assert.equal(winnerMismatches,0);equity.forEach(c=>assert.ok(c.absoluteError<1e-8));
actionCases.forEach(c=>assert.ok(c.absoluteError<Math.max(.15,c.ci95*2),`EV benchmark failed: ${c.hero} ${c.action} ${c.policy}`));
