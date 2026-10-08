import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCard, formatCard, evaluate, categoryOf, calculate, outcomeCount, validate } from '../src/poker.js';
const cards = text => text.split(' ').map(parseCard);
const input = (hero, board, opponents, iterations = 10000) => ({ hero: cards(hero), board: board ? cards(board) : [], opponents: opponents.map(h => h ? cards(h) : []), iterations });
function rng(seed) { return () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 2 ** 32; }; }
test('card codec covers every card', () => { for (let c = 0; c < 52; c++) assert.equal(parseCard(formatCard(c)), c); assert.equal(parseCard('10H'), parseCard('Th')); assert.throws(() => parseCard('1s')); });
test('all nine categories in increasing order', () => {
  const hands = ['As Jd 9c 6h 3s','As Ad 9c 6h 3s','As Ad 9c 9h 3s','As Ad Ac 6h 3s','As 2d 3c 4h 5s','As Js 9s 6s 3s','As Ad Ac 6h 6s','As Ad Ac Ah 3s','9s Ts Js Qs Ks'];
  const scores = hands.map(h => evaluate(cards(h)));
  scores.forEach((s,i) => assert.equal(categoryOf(s), i));
  scores.slice(1).forEach((s,i) => assert.ok(s > scores[i]));
});
test('wheel, kickers, two triples and three pairs', () => {
  assert.ok(evaluate(cards('2s 3d 4c 5h 6s')) > evaluate(cards('As 2d 3c 4h 5s')));
  assert.ok(evaluate(cards('As Ad Kc 8h 7s')) > evaluate(cards('Ah Ac Qc Jh Ts')));
  assert.equal(evaluate(cards('As Ah Ad Ks Kh Kd 2c')), evaluate(cards('As Ah Ad Ks Kh')));
  assert.equal(evaluate(cards('As Ah Ks Kh Qs Qh Jd')), evaluate(cards('As Ah Ks Kh Qs')));
  assert.equal(evaluate(cards('As 2s 3s 4s 5s Kd Qh')), evaluate(cards('As 2s 3s 4s 5s')));
});
test('seven-card direct evaluator matches every five-card subset for random deals', () => {
  const random = rng(73);
  for (let trial=0;trial<2000;trial++) {
    const deck = Array.from({length:52},(_,i)=>i);
    for(let i=0;i<7;i++){const j=i+Math.floor(random()*(52-i));[deck[i],deck[j]]=[deck[j],deck[i]];}
    const h=deck.slice(0,7); let best=0;
    for(let a=0;a<3;a++)for(let b=a+1;b<4;b++)for(let c=b+1;c<5;c++)for(let d=c+1;d<6;d++)for(let e=d+1;e<7;e++) best=Math.max(best,evaluate([h[a],h[b],h[c],h[d],h[e]]));
    assert.equal(evaluate(h),best, h.map(formatCard).join(' '));
  }
});
test('three-way board royal flush splits the pot exactly', () => {
  const result=calculate(input('2h 3h','As Ks Qs Js Ts',['4d 5d','6c 7c']));
  assert.equal(result.samples,1); assert.equal(result.method,'exact');
  result.players.forEach(p=>{assert.equal(p.tie,100);assert.equal(p.win,0);assert.ok(Math.abs(p.equity-100/3)<1e-10);});
});
test('river unknown opponent enumerates 990 legal hands', () => {
  const config=input('As Ks','Qs Js Ts 2h 3h',['']); assert.equal(outcomeCount(config),990);
  const result=calculate(config); assert.equal(result.samples,990); assert.equal(result.players[0].win,100);
  assert.equal(result.players[1].equity,0);
});
test('known flop opponents enumerate 990 boards; turn enumerates 44', () => {
  assert.equal(outcomeCount(input('As Ah','2s 3s 4d',['Ks Kh'])),990);
  assert.equal(outcomeCount(input('As Ah','2s 3s 4d 5c',['Ks Kh'])),44);
});
test('invalid boards, duplicate cards and partial opponent hands are rejected',()=>{
  assert.throws(()=>calculate(input('As Ah','2s',[''])));
  assert.throws(()=>calculate(input('As Ah','',['As Ks'])));
  assert.throws(()=>calculate(input('As Ah','',['Ks'])));
  assert.throws(()=>validate({...input('As Ah','',['']),iterations:Infinity}));
});
test('deterministic AA versus random benchmark and conservation',()=>{
  const result=calculate(input('As Ah','',[''],30000),()=>{},rng(123));
  assert.equal(result.method,'monte-carlo'); assert.ok(result.players[0].equity>83 && result.players[0].equity<87);
  assert.ok(Math.abs(result.players.reduce((s,p)=>s+p.equity,0)-100)<1e-8);
  result.players.forEach(p=>assert.ok(Math.abs(p.win+p.tie+p.lose-100)<1e-8));
  assert.ok(Math.abs(result.categories.reduce((s,p)=>s+p,0)-100)<1e-8);
});
