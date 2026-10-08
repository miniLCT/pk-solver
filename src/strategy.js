import { RANKS, parseCard, evaluate, categoryOf, validate } from './poker.js';
export const PROFILES = {
  balanced: { name: '常规型', aggression: 0.5, calling: 0, bluff: 0.07 },
  tight: { name: '紧弱型', aggression: 0.27, calling: -0.1, bluff: 0.025 },
  loose: { name: '松被动型', aggression: 0.25, calling: 0.13, bluff: 0.03 },
  aggressive: { name: '松激进型', aggression: 0.8, calling: 0.06, bluff: 0.16 }
};
export const POLICIES = { cautious: '谨慎控池', value: '价值优先', pressure: '积极施压' };
export const STREETS = ['翻牌前', '翻牌', '转牌', '河牌'];
export const streetIndex = board => ({0:0,3:1,4:2,5:3})[board.length] ?? -1;
export function seededRandom(seed) {
  let value = Number(seed) >>> 0;
  return () => {
    value = (value + 0x6D2B79F5) >>> 0;
    let mixed = Math.imul(value ^ (value >>> 15), value | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
export function preflopStrength(hand) {
  const [a, b] = hand.map(c => c % 13 + 2).sort((a,b) => b-a);
  if (a === b) return 0.53 + (a - 2) * 0.038;
  const suited = Math.floor(hand[0]/13) === Math.floor(hand[1]/13);
  return Math.min(0.89, 0.12 + (a-2)*0.034 + (b-2)*0.024 + (suited ? 0.06 : 0) + (a-b <= 2 ? 0.035 : 0));
}
export function strength(hand, board) {
  if (!board.length) return preflopStrength(hand);
  const all = [...hand,...board], value = evaluate(all), category = categoryOf(value);
  const top = Math.floor(value / 15 ** 4) % 15;
  let estimate = [0.13,0.38,0.63,0.76,0.84,0.88,0.94,0.985,0.998][category];
  if (category === 0) estimate += Math.max(...hand.map(c=>c%13+2))/14 * 0.13;
  if (category === 1) {
    const boardRanks = board.map(c=>c%13+2);
    const personal = hand.some(c=>c%13+2===top);
    estimate += personal ? 0.07 + (top/14)*0.09 : -0.09;
    if (personal && top >= Math.max(...boardRanks)) estimate += 0.055;
  }
  if (category === 2 && hand.every(c=>!board.some(b=>b%13===c%13))) estimate -= 0.14;
  if (board.length < 5) {
    const suits = [0,0,0,0]; all.forEach(c=>suits[Math.floor(c/13)]++);
    if (suits.some((n,s)=>n===4 && hand.some(c=>Math.floor(c/13)===s))) estimate += 0.11;
    const ranks = new Set(all.map(c=>c%13+2)); if(ranks.has(14))ranks.add(1);
    let draw = false;
    for(let high=5;high<=14;high++) { let n=0; for(let r=high-4;r<=high;r++) if(ranks.has(r)) n++; if(n===4)draw=true; }
    if(draw)estimate+=0.06;
  }
  return Math.min(0.999,Math.max(0.02,estimate));
}
function handType(hand) {
  const ranks=hand.map(c=>c%13).sort((a,b)=>b-a);
  return RANKS[ranks[0]]+RANKS[ranks[1]]+(ranks[0]===ranks[1]?'':Math.floor(hand[0]/13)===Math.floor(hand[1]/13)?'s':'o');
}
// Deliberately small, documented range grammar: pairs, suited/offsuit hands, '+', exact combos and weights.
export function parseRange(expression) {
  const weights = new Map();
  const all=[];for(let a=0;a<52;a++)for(let b=a+1;b<52;b++)all.push([a,b]);
  for(const raw of expression.split(/[\s,]+/).filter(Boolean)) {
    const [token,weightText,...extra]=raw.split(':');
    const weight=weightText==null?1:Number(weightText);
    if(extra.length||!Number.isFinite(weight)||weight<0||weight>1)throw new Error(`范围权重无效：${raw}`);
    if(/^[2-9TJQKA][shdc][2-9TJQKA][shdc]$/i.test(token)) {
      const hand=[parseCard(token.slice(0,2)),parseCard(token.slice(2,4))].sort((a,b)=>a-b);
      if(hand[0]===hand[1])throw new Error(`范围有重复牌：${token}`);
      weights.set(hand.join(','),weight);continue;
    }
    const m=token.toUpperCase().match(/^([2-9TJQKA])([2-9TJQKA])([SO])?(\+)?$/);
    if(!m)throw new Error(`不支持的范围：${token}。示例：22+, AJs+, KQo, AsKh:0.5`);
    const first=RANKS.indexOf(m[1]),second=RANKS.indexOf(m[2]);
    if(first<second||(first===second&&m[3]))throw new Error(`范围顺序无效：${token}`);
    for(const hand of all) {
      const type=handType(hand),a=RANKS.indexOf(type[0]),b=RANKS.indexOf(type[1]);
      let matches=first===second?a===b&&(m[4]?a>=first:a===first):a===first&&(m[4]?b>=second&&b<first:b===second)&&(!m[3]||type[2]===m[3].toLowerCase());
      if(matches)weights.set(hand.join(','),weight);
    }
  }
  if(!weights.size)throw new Error('请输入对手范围');
  return weights;
}
function sigmoid(x) { return 1/(1+Math.exp(-x)); }
export function observedLikelihood(hand, event, profile) {
  const s=strength(hand,event.board),p=PROFILES[profile];
  if(event.action==='check'||event.action==='bet') {
    const bet=Math.min(.98,Math.max(.02,p.bluff+p.aggression*sigmoid((s-.5-event.size*.12)*9)));
    return event.action==='bet'?bet:1-bet;
  }
  const call=sigmoid((s-(event.size/(1+event.size))-.14+p.calling)*9);
  const raise=Math.min(call*.75,p.bluff/2+p.aggression*sigmoid((s-.78)*12)*.6);
  return event.action==='raise'?raise:event.action==='fold'?1-call:call-raise;
}
export function buildRange(config) {
  const used=new Set([...config.hero,...config.board]);
  const custom=config.range==='custom'?parseRange(config.rangeText):null;
  let combos=[];
  for(let a=0;a<52;a++)for(let b=a+1;b<52;b++) {
    const hand=[a,b],prior=custom?custom.get(hand.join(','))||0:1;
    if(prior>0)combos.push({hand,prior,weight:prior,type:handType(hand)});
  }
  if(config.range!=='custom'&&config.range!=='random') {
    combos.sort((a,b)=>preflopStrength(b.hand)-preflopStrength(a.hand));
    const cutoff=preflopStrength(combos[Math.ceil(combos.length*(config.range==='tight'?.15:.4))-1].hand);
    combos=combos.filter(combo=>preflopStrength(combo.hand)>=cutoff);
  }
  combos=combos.filter(combo=>combo.hand.every(card=>!used.has(card)));
  for(const combo of combos)for(const event of config.history)combo.weight*=observedLikelihood(combo.hand,event,config.profile);
  const sum=combos.reduce((n,c)=>n+c.weight,0);
  if(!(sum>0))throw new Error('范围与已知牌冲突，已无可用手牌');
  let cumulative=0;
  for(const combo of combos) {combo.probability=combo.weight/sum; cumulative+=combo.probability;combo.cumulative=cumulative;}
  return combos;
}
export function validateStrategy(config) {
  validate({...config,opponents:[[]],iterations:10000});
  for(const [key,min,max] of [['pot',.01,100000],['stack',.01,100000],['toCall',0,100000],['trials',1000,30000]]) {
    if(!Number.isFinite(config[key])||config[key]<min||config[key]>max)throw new Error(`${({pot:'当前底池',stack:'有效筹码',toCall:'当前需跟注',trials:'模拟次数'})[key]}超出有效范围`);
  }
  if(!Number.isInteger(config.trials))throw new Error('路线模拟次数必须为整数');
  if(config.toCall>config.stack||config.toCall>=config.pot)throw new Error('需跟注金额不能超过有效筹码，且必须小于当前底池');
  if(!['ip','oop'].includes(config.position)||!PROFILES[config.profile]||!['random','balanced','tight','custom'].includes(config.range))throw new Error('无效位置、对手模型或范围');
  if(!Number.isInteger(config.seed)||config.seed<0||config.seed>4294967295)throw new Error('随机种子必须为 0–4294967295 的整数');
  if(!Array.isArray(config.history))throw new Error('无效行动历史');
  let previousStreet=-1;
  for(const event of config.history) {
    if(![0,3,4,5].includes(event.board.length)||event.board.length>config.board.length||!event.board.every((c,i)=>c===config.board[i]))throw new Error('行动历史公共牌与当前牌面不一致');
    if(streetIndex(event.board)<previousStreet)throw new Error('行动历史应按街次顺序录入');
    previousStreet=streetIndex(event.board);
    if(!['check','bet','call','raise'].includes(event.action)||!Number.isFinite(event.size)||event.size<0||event.size>5)throw new Error('无效历史行动或下注尺度');
    if(event.action!=='check'&&event.size<=0)throw new Error('下注、跟注和加注的历史尺度必须大于 0');
  }
}
export function initialState(config) {
  return { pot:config.pot, remaining:[config.stack,config.stack-config.toCall], paid:[0,config.toCall], invested:0, actor:0, checks:config.toCall?0:config.position==='ip'?1:0, raises:0, lastRaise:config.toCall||1, board:[...config.board], terminal:null, route:[] };
}
export function legalActions(state) {
  const actor=state.actor,other=1-actor,call=Math.max(0,state.paid[other]-state.paid[actor]);
  const actions=call>1e-9?[{kind:'fold',amount:0,label:'弃牌'},{kind:'call',amount:Math.min(call,state.remaining[actor]),label:`跟注 ${Math.min(call,state.remaining[actor]).toFixed(1)} BB`}]:[{kind:'check',amount:0,label:'过牌'}];
  const maxPay=Math.min(state.remaining[actor],state.remaining[other]+call);
  if(maxPay<=call+1e-9||state.remaining[other]<=1e-9||(call>0&&state.raises>=1))return actions;
  const seen=new Set();
  for(const fraction of [.33,.75,1,Infinity]) {
    const extra=call?Math.max(state.lastRaise,(state.pot+call)*fraction):Math.max(1,state.pot*fraction);
    const pay=Math.min(maxPay,call+extra);
    if(seen.has(pay.toFixed(6)))continue;seen.add(pay.toFixed(6));
    actions.push({kind:call?'raise':'bet',amount:pay,label:pay>=maxPay-1e-9?`${call?'加注':'下注'} 全下 ${pay.toFixed(1)} BB`:`${call?'加注':'下注'} ${pay.toFixed(1)} BB`,fraction});
  }
  return actions;
}
export function transition(state,action) {
  const next={...state,remaining:[...state.remaining],paid:[...state.paid],board:[...state.board],route:[...state.route]};
  const actor=state.actor,other=1-actor,call=Math.max(0,state.paid[other]-state.paid[actor]);
  next.route.push(`${STREETS[streetIndex(state.board)]}·${actor===0?'你':'对手'}${action.kind==='bet'||action.kind==='raise'?action.amount>=Math.min(state.remaining[actor],state.remaining[other]+call)-1e-9?'全下':action.kind==='bet'?'下注':'加注':({check:'过牌',call:'跟注',fold:'弃牌'})[action.kind]}`);
  if(action.kind==='fold') {next.terminal=actor===0?'hero-fold':'villain-fold';return next;}
  if(action.kind==='check') {next.checks++; if(next.checks===2)next.terminal='street-end';else next.actor=other;return next;}
  next.remaining[actor]-=action.amount;next.paid[actor]+=action.amount;next.pot+=action.amount;
  if(actor===0)next.invested+=action.amount;
  if(action.kind==='call') {next.terminal='street-end';return next;}
  next.lastRaise=action.amount-call;next.raises+=action.kind==='raise'?1:0;next.checks=0;next.actor=other;
  return next;
}
export function responseProbabilities(hand,state,profile) {
  const actions=legalActions(state),s=strength(hand,state.board),p=PROFILES[profile];
  const call=Math.max(0,state.paid[1-state.actor]-state.paid[state.actor]);
  const raises=actions.filter(a=>a.kind==='raise'||a.kind==='bet');
  let aggressive;
  const probabilities=actions.map(()=>0);
  if(call>0) {
    const continueP=sigmoid((s-call/(state.pot+call)-.14+p.calling)*9);
    aggressive=raises.length?Math.min(continueP*.8,p.bluff/2+p.aggression*sigmoid((s-.77)*11)*.55):0;
    actions.forEach((a,i)=>{if(a.kind==='fold')probabilities[i]=1-continueP;if(a.kind==='call')probabilities[i]=continueP-aggressive;});
  } else {
    aggressive=raises.length?Math.min(.97,p.bluff+p.aggression*sigmoid((s-.5)*9)):0;
    actions.forEach((a,i)=>{if(a.kind==='check')probabilities[i]=1-aggressive;});
  }
  const sizeWeights=raises.map(a=>a.fraction===Infinity?.08:a.fraction===.33?1.2-s:s+.15);
  const sum=sizeWeights.reduce((a,b)=>a+b,0);
  raises.forEach((a,i)=>{probabilities[actions.indexOf(a)]=aggressive*sizeWeights[i]/sum;});
  return actions.map((a,i)=>({action:a,probability:probabilities[i]}));
}
export function heroDecision(hand,state,policy) {
  const actions=legalActions(state),s=strength(hand,state.board),call=Math.max(0,state.paid[1]-state.paid[0]);
  const margin={cautious:.15,value:.07,pressure:-.015}[policy];
  const aggressionThreshold={cautious:.85,value:.7,pressure:.55}[policy];
  const aggression=actions.filter(a=>a.kind==='raise'||a.kind==='bet');
  if(aggression.length&&s>aggressionThreshold) {
    return aggression[Math.min(aggression.length-1,policy==='pressure'?1:0)];
  }
  if(call>0)return actions.find(a=>a.kind===(s>=call/(state.pot+call)+margin+.12?'call':'fold'));
  return actions.find(a=>a.kind==='check');
}
function selectWeighted(items,random) {
  const n=random();let sum=0;
  for(const item of items){sum+=item.probability;if(n<sum)return item;}
  return items[items.length-1];
}
function sampleRange(range,random) {
  const n=random();let lo=0,hi=range.length-1;
  while(lo<hi){const mid=(lo+hi)>>1;if(range[mid].cumulative<n)lo=mid+1;else hi=mid;}
  return range[lo].hand;
}
export function payoff(state,hero,villain,board) {
  if(state.terminal==='hero-fold')return state.invested ? -state.invested : 0;
  if(state.terminal==='villain-fold')return state.pot-state.invested;
  const a=evaluate([...hero,...board]),b=evaluate([...villain,...board]);
  return (a>b?state.pot:a===b?state.pot/2:0)-state.invested;
}
function advanceStreet(state,config,runout) {
  if(state.board.length===5||state.remaining.some(n=>n<=1e-9))return {...state,terminal:'showdown',board:runout};
  const length=state.board.length===0?3:state.board.length+1;
  return {...state,board:runout.slice(0,length),paid:[0,0],checks:0,raises:0,lastRaise:1,actor:config.position==='oop'?0:1,terminal:null};
}
function rollout(config,villain,runout,root,policy,random) {
  let state=transition(initialState(config),root);
  let firstResponse=null;
  for(let step=0;step<40;step++) {
    if(state.terminal==='street-end')state=advanceStreet(state,config,runout);
    if(state.terminal) return {ev:payoff(state,config.hero,villain,runout),route:state.route.join(' → '),response:firstResponse||'无需回应'};
    const action=state.actor===0?heroDecision(config.hero,state,policy):selectWeighted(responseProbabilities(villain,state,config.profile),random).action;
    if(state.actor===1&&firstResponse==null)firstResponse=({fold:'弃牌',call:'跟注',check:'过牌',bet:'下注',raise:'加注'})[action.kind];
    state=transition(state,action);
  }
  throw new Error('行动树未终止');
}
export function analyze(config,onProgress=()=>{}) {
  validateStrategy(config);
  const range=buildRange(config),roots=legalActions(initialState(config));
  const policies=Object.keys(POLICIES);
  const stats=roots.map(action=>({action,policies:Object.fromEntries(policies.map(p=>[p,{sum:0,square:0,routes:new Map(),responses:new Map()}]))}));
  let equity=0;
  for(let trial=0;trial<config.trials;trial++) {
    const random=seededRandom((config.seed+Math.imul(trial+1,2654435761))>>>0);
    const villain=sampleRange(range,random),used=new Set([...config.hero,...config.board,...villain]);
    const deck=Array.from({length:52},(_,i)=>i).filter(c=>!used.has(c));
    const needed=5-config.board.length;
    for(let i=0;i<needed;i++){const j=i+Math.floor(random()*(deck.length-i));[deck[i],deck[j]]=[deck[j],deck[i]];}
    const runout=[...config.board,...deck.slice(0,needed)],a=evaluate([...config.hero,...runout]),b=evaluate([...villain,...runout]);equity+=a>b?1:a===b?.5:0;
    for(const row of stats)for(const policy of policies) {
      // Common random numbers share hidden cards/runouts and response noise across alternatives.
      const result=rollout(config,villain,runout,row.action,policy,seededRandom((config.seed+trial*8191)>>>0));
      const s=row.policies[policy];s.sum+=result.ev;s.square+=result.ev**2;
      s.routes.set(result.route,(s.routes.get(result.route)||0)+1);s.responses.set(result.response,(s.responses.get(result.response)||0)+1);
    }
    if((trial+1)%250===0)onProgress(trial+1,config.trials);
  }
  const summary=new Map();range.forEach(c=>summary.set(c.type,(summary.get(c.type)||0)+c.probability));
  return {
    trials:config.trials,seed:config.seed,equity:equity/config.trials*100,combos:range.length,
    rangeSummary:[...summary].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([hand,probability])=>({hand,probability})),
    rows:stats.map(row=>({action:row.action,policies:Object.fromEntries(policies.map(p=>{
      const s=row.policies[p],ev=s.sum/config.trials,variance=Math.max(0,(s.square-s.sum*s.sum/config.trials)/(config.trials-1));
      return [p,{ev,ci:1.96*Math.sqrt(variance/config.trials),routes:[...s.routes].sort((a,b)=>b[1]-a[1]).slice(0,4).map(([route,n])=>({route,probability:n/config.trials})),responses:[...s.responses].map(([action,n])=>({action,probability:n/config.trials}))}];
    }))}))
  };
}
// Exhaustive response-tree integration for river numerical benchmarks; not a GTO solver.
export function exactRiverEV(config,root,policy) {
  validateStrategy(config);if(config.board.length!==5)throw new Error('精确行动基准仅限河牌');
  const visit=(state,villain)=> {
    if(state.terminal)return payoff(state,config.hero,villain,config.board);
    if(state.actor===0)return visit(transition(state,heroDecision(config.hero,state,policy)),villain);
    return responseProbabilities(villain,state,config.profile).reduce((n,item)=>n+item.probability*visit(transition(state,item.action),villain),0);
  };
  return buildRange(config).reduce((n,c)=>n+c.probability*visit(transition(initialState(config),root),c.hand),0);
}
