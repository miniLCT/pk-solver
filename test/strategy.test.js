import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCard } from '../src/poker.js';
import { parseRange,buildRange,strength,validateStrategy,initialState,legalActions,transition,payoff,responseProbabilities,heroDecision,analyze,exactRiverEV } from '../src/strategy.js';
const cards=s=>s.split(' ').map(parseCard);
const config=(extra={})=>({hero:cards('As Kh'),board:cards('Qs Js Ts 2h 3d'),pot:10,stack:20,toCall:0,position:'ip',profile:'balanced',range:'random',history:[],trials:2000,seed:2026,...extra});
test('range grammar counts, plus expansion, and weights',()=>{
  assert.equal(parseRange('AA').size,6);assert.equal(parseRange('AKs').size,4);assert.equal(parseRange('AKo').size,12);assert.equal(parseRange('AK').size,16);
  assert.equal(parseRange('QQ+').size,18);assert.equal(parseRange('AJs+').size,12);
  assert.equal(parseRange('AsKh:0.5').values().next().value,.5);
  assert.throws(()=>parseRange('KAs'));assert.throws(()=>parseRange('AsAs'));assert.throws(()=>parseRange('AA:1.5'));assert.throws(()=>parseRange('22-99'));
});
test('blockers and history posterior are normalized',()=>{
  const c=config();const range=buildRange(c);assert.equal(range.length,990);
  range.forEach(combo=>assert.ok(combo.hand.every(card=>![...c.hero,...c.board].includes(card))));
  assert.ok(Math.abs(range.reduce((s,r)=>s+r.probability,0)-1)<1e-10);
  const prior=buildRange(config({board:cards('Qs Js 2h')}));
  const posterior=buildRange(config({board:cards('Qs Js 2h'),history:[{board:cards('Qs Js 2h'),action:'bet',size:1}]}));
  const avg=items=>items.reduce((n,c)=>n+c.probability*strength(c.hand,cards('Qs Js 2h')),0);
  assert.ok(avg(posterior)>avg(prior));
  assert.throws(()=>buildRange(config({range:'custom',rangeText:'AsKh'})));
});
test('root check/call/fold legality and min-raise / all-in caps',()=>{
  assert.ok(!legalActions(initialState(config())).some(a=>a.kind==='fold'||a.kind==='call'));
  const state=initialState(config({pot:15,toCall:5,stack:12}));const actions=legalActions(state);
  assert.ok(actions.some(a=>a.kind==='fold'));assert.equal(actions.find(a=>a.kind==='call').amount,5);
  actions.filter(a=>a.kind==='raise').forEach(a=>{assert.ok(a.amount>=10);assert.ok(a.amount<=12);});
  const short=legalActions(initialState(config({pot:15,toCall:5,stack:7}))).find(a=>a.kind==='raise');assert.equal(short.amount,7);
});
test('sunk cost baseline, known call EV, and ties use net incremental payoff',()=>{
  const c=config({pot:15,toCall:5,range:'custom',rangeText:'9c9d'}),s=initialState(c);
  const fold=transition(s,legalActions(s)[0]);assert.equal(payoff(fold,c.hero,cards('9c 9d'),c.board),0);
  const call=transition(s,legalActions(s)[1]);assert.equal(call.pot,20);assert.equal(call.invested,5);
  assert.equal(payoff(call,c.hero,cards('9c 9d'),c.board),15);
  assert.equal(exactRiverEV(c,legalActions(s)[1],'value'),15);
  const tie=config({hero:cards('2h 3h'),board:cards('As Ks Qs Js Ts'),pot:15,toCall:5});
  assert.ok(Math.abs(exactRiverEV(tie,legalActions(initialState(tie))[1],'value')-5)<1e-10);
});
test('bet, raise, call accounting conserves stacks and caps one raise',()=>{
  const c=config({pot:10,stack:50});let s=initialState(c);
  s=transition(s,legalActions(s).find(a=>a.kind==='bet'&&a.fraction===1));assert.equal(s.pot,20);assert.equal(s.invested,10);
  const raise=legalActions(s).find(a=>a.kind==='raise'&&a.fraction===.33);assert.ok(raise.amount>=20);
  s=transition(s,raise);assert.equal(s.raises,1);assert.ok(!legalActions(s).some(a=>a.kind==='raise'));
  s=transition(s,legalActions(s).find(a=>a.kind==='call'));
  assert.equal(s.paid[0],s.paid[1]);assert.ok(Math.abs(s.pot-(10+s.invested+s.paid[1]))<1e-9);
  assert.ok(s.remaining.every(x=>x>=0));
});
test('policies receive only own cards and current public board',()=>{
  const s=initialState(config({board:cards('Qs Js 2h')}));
  // Adding hidden information to the state cannot change either policy's decisions.
  const decorated={...s,opponentHand:cards('Ah Ad'),futureBoard:cards('Qs Js 2h Ac As')};
  assert.deepEqual(heroDecision(cards('As Kh'),s,'value'),heroDecision(cards('As Kh'),decorated,'value'));
  assert.deepEqual(responseProbabilities(cards('9c 9d'),s,'balanced'),responseProbabilities(cards('9c 9d'),decorated,'balanced'));
  for(const profile of ['balanced','tight','loose','aggressive']){
    const probs=responseProbabilities(cards('9c 9d'),s,profile);assert.ok(probs.every(p=>p.probability>=0));assert.ok(Math.abs(probs.reduce((n,p)=>n+p.probability,0)-1)<1e-10);
  }
});
test('invalid scenario and future history rejected',()=>{
  assert.throws(()=>validateStrategy(config({toCall:21})));
  assert.throws(()=>validateStrategy(config({toCall:10})));
  assert.throws(()=>validateStrategy(config({seed:1.5})));
  assert.throws(()=>validateStrategy(config({board:cards('Qs Js 2h'),history:[{board:cards('Qs Js 2h 4d'),action:'check',size:0}]})));
  assert.throws(()=>validateStrategy(config({history:[{board:cards('Qs Js Ts'),action:'bet',size:0}]})));
});
test('rollouts reproduce identical seeds and converge to exact river EV',()=>{
  const c=config({pot:15,toCall:5,trials:10000});const result=analyze(c);
  assert.deepEqual(result,analyze(c));
  for(const row of result.rows)for(const policy of ['cautious','value','pressure']){
    const exact=exactRiverEV(c,row.action,policy);const sampled=row.policies[policy];
    assert.ok(Math.abs(exact-sampled.ev)<Math.max(.15,sampled.ci*2),`${row.action.label} ${policy}: ${exact} / ${sampled.ev}`);
  }
});
test('all-in runouts and every street terminate',()=>{
  for(const board of [[],cards('Qs Js 2h'),cards('Qs Js 2h 4d'),cards('Qs Js 2h 4d 5d')]){
    const result=analyze(config({board,stack:2,pot:10,trials:1000}));
    result.rows.forEach(row=>Object.values(row.policies).forEach(s=>{assert.ok(Number.isFinite(s.ev));assert.ok(s.ev>=-2&&s.ev<=12);assert.ok(s.routes.length>0);}));
  }
});
