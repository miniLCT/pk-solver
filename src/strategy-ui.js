import { formatCard, parseCard } from './poker.js';
import { validateStrategy, POLICIES, STREETS, streetIndex } from './strategy.js';
const $=id=>document.getElementById(id);
let history=[],worker=null,last=null,lastInput=null,policy='value',selectedRow=0;
const signed=n=>`${n>=0?'+':''}${n.toFixed(2)}`;
const inputIds=['pot','stack','to-call','position','profile','range','range-text','strategy-trials','seed'];
function context() {
  const c=window.river.getConfig();
  const hand=c.hero.map(formatCard).join(' '),board=c.board.map(formatCard).join(' ')||'尚未发出';
  $('strategy-context').textContent=`你的手牌：${hand||'未选择'} · 公共牌：${board} · ${STREETS[streetIndex(c.board)]||'请补齐翻牌'}`;
  const available=[0,3,4,5].filter(n=>n<=c.board.length);
  const selected=$('history-street').value;
  $('history-street').replaceChildren(...available.map(n=>{const option=document.createElement('option');option.value=n;option.textContent=STREETS[streetIndex(Array(n))];return option;}));
  $('history-street').value=selected!==''&&available.includes(Number(selected))?selected:available[available.length-1];
  const filtered=history.filter(event=>event.board.length<=c.board.length&&event.board.every((card,i)=>card===c.board[i]));
  if(filtered.length!==history.length){history=filtered;showError('牌面已改变，不匹配的历史记录已移除，请核对历史。');}
  renderHistory();
}
function readInput() {
  const c=window.river.getConfig();
  if(c.opponents.length!==1||c.opponents[0].length)throw new Error('行动模拟需要单挑；请将上方对手人数设为 1，并将其手牌留空。');
  return {hero:c.hero,board:c.board,pot:Number($('pot').value),stack:Number($('stack').value),toCall:Number($('to-call').value),position:$('position').value,profile:$('profile').value,range:$('range').value,rangeText:$('range-text').value,history:history.map(event=>({...event,board:[...event.board]})),trials:Number($('strategy-trials').value),seed:Number($('seed').value)};
}
function showError(message){$('strategy-error').textContent=message;$('strategy-error').hidden=false;}
function invalidate(){if(worker){worker.terminate();worker=null;}$('analyze').disabled=false;$('strategy-cancel').hidden=true;$('strategy-progress').hidden=true;$('strategy-content').hidden=true;$('strategy-empty').hidden=false;$('export-analysis').hidden=true;$('strategy-error').hidden=true;last=null;}
function renderHistory(){
  $('history-list').replaceChildren(...history.map((event,index)=>{
    const row=document.createElement('div');row.className='history-row';
    const text=document.createElement('span');text.textContent=`${STREETS[streetIndex(event.board)]} · 对手${({check:'过牌',bet:'下注',call:'跟注',raise:'加注'})[event.action]}${event.action==='check'?'':` ${Math.round(event.size*100)}% 底池`}`;
    const remove=document.createElement('button');remove.textContent='×';remove.setAttribute('aria-label',`删除第 ${index+1} 条历史`);remove.onclick=()=>{history.splice(index,1);invalidate();renderHistory();};
    row.append(text,remove);return row;
  }));
}
function renderResults(){
  if(!last)return;
  const bestIndex=last.rows.reduce((best,row,i)=>row.policies[policy].ev>last.rows[best].policies[policy].ev?i:best,0);
  const best=last.rows[bestIndex],metric=best.policies[policy];
  $('strategy-best').textContent=`${POLICIES[policy]}后续策略下，${best.action.label}`;
  $('strategy-summary-copy').textContent=`模型估计 EV ${signed(metric.ev)} BB，近似 95% 抽样区间 ±${metric.ci.toFixed(2)} BB。对手范围加权后的摊牌权益为 ${last.equity.toFixed(2)}%，可用组合 ${last.combos} 个；不含未来下注的权益与行动 EV 含义不同。`;
  $('range-summary').replaceChildren(...last.rangeSummary.map(item=>{const span=document.createElement('span');span.textContent=`${item.hand} ${(item.probability*100).toFixed(1)}%`;return span;}));
  document.querySelectorAll('[data-policy]').forEach(b=>{const active=b.dataset.policy===policy;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',active);});
  $('ev-table').replaceChildren(...last.rows.map((row,i)=>{
    const s=row.policies[policy],button=document.createElement('button');button.className=`ev-row${i===selectedRow?' active':''}${i===bestIndex?' best':''}`;
    const label=document.createElement('span');label.className='ev-label';label.textContent=row.action.label;
    const value=document.createElement('span');value.className=`ev-value${s.ev<0?' negative':''}`;value.textContent=signed(s.ev);
    const interval=document.createElement('small');interval.textContent=`±${s.ci.toFixed(2)}`;value.append(interval);
    button.append(label,value);button.onclick=()=>{selectedRow=i;renderResults();};return button;
  }));
  const chosen=last.rows[selectedRow],s=chosen.policies[policy];
  $('route-title').textContent=`${chosen.action.label} · 后续路线`;
  $('responses').replaceChildren(...s.responses.map(item=>{const span=document.createElement('span');span.textContent=`对手${item.action} ${(item.probability*100).toFixed(1)}%`;if(item.action==='无需回应')span.textContent='该行动直接终止牌局';return span;}));
  $('routes').replaceChildren(...s.routes.map(item=>{const div=document.createElement('div');div.className='route';const p=document.createElement('p');p.textContent=item.route;const freq=document.createElement('span');freq.textContent=`${(item.probability*100).toFixed(1)}% 模拟频率`;div.append(p,freq);return div;}));
  $('strategy-meta').textContent=`每条行动 × 每种后续策略 ${last.trials.toLocaleString('zh-CN')} 次 · 种子 ${last.seed} · ${(last.elapsed/1000).toFixed(2)} 秒。区间仅描述抽样误差，不包含对手模型误差；此处最高 EV 不是 GTO 策略保证。`;
}
function start(){
  invalidate();let config;
  try{config=readInput();validateStrategy(config);}catch(e){showError(e.message);return;}
  lastInput=config;$('strategy-empty').hidden=true;$('strategy-progress').hidden=false;$('analyze').disabled=true;$('strategy-cancel').hidden=false;
  $('strategy-progress-text').textContent='准备对手范围与行动树…';$('strategy-progress-bar').value=0;
  try{worker=new Worker(new URL('./strategy-worker.js',import.meta.url),{type:'module'});}catch(e){invalidate();showError(e.message);return;}
  const activeWorker=worker;
  worker.onmessage=({data})=>{
    if(worker!==activeWorker)return;
    if(data.type==='progress'){$('strategy-progress-text').textContent=`${data.done.toLocaleString()} / ${data.total.toLocaleString()} 次 · 同时比较三种后续策略`;$('strategy-progress-bar').value=data.done/data.total*100;}
    else{worker.terminate();worker=null;$('analyze').disabled=false;$('strategy-cancel').hidden=true;$('strategy-progress').hidden=true;if(data.type==='error'){invalidate();showError(data.message);}else{last=data.result;selectedRow=last.rows.reduce((b,r,i)=>r.policies[policy].ev>last.rows[b].policies[policy].ev?i:b,0);$('strategy-content').hidden=false;$('export-analysis').hidden=false;renderResults();}}
  };
  worker.onerror=()=>{if(worker!==activeWorker)return;invalidate();showError('模拟线程发生错误，请重试。');};worker.postMessage(config);
}
$('analyze').onclick=start;$('strategy-cancel').onclick=invalidate;
inputIds.forEach(id=>$(id).addEventListener('input',()=>{invalidate();$('range-text-wrap').hidden=$('range').value!=='custom';}));
$('history-action').onchange=()=>{$('history-size').disabled=$('history-action').value==='check';};$('history-size').disabled=true;
$('history-add').onclick=()=>{
  const c=window.river.getConfig(),size=$('history-action').value==='check'?0:Number($('history-size').value)/100;
  if(!Number.isFinite(size)||size<0||size>5||($('history-action').value!=='check'&&size<=0)){showError('历史尺度应为 1%–500%；过牌无须填写尺度。');return;}
  const length=Number($('history-street').value);
  if(history.length&&length<history[history.length-1].board.length){showError('请按街次顺序添加历史行动。');return;}
  history.push({board:c.board.slice(0,length),action:$('history-action').value,size});invalidate();renderHistory();
};
window.addEventListener('cards-changed',()=>{invalidate();context();});
document.querySelectorAll('[data-policy]').forEach(b=>b.onclick=()=>{policy=b.dataset.policy;renderResults();});
$('strategy-demo').onclick=()=>{
  window.river.state.hero=['Ah','Kh'].map(parseCard);window.river.state.board=[...['Qh','7h','2c'].map(parseCard),null,null];window.river.state.opponents=[[null,null]];history=[];window.river.invalidate();window.river.render();
  $('pot').value=15;$('stack').value=60;$('to-call').value=5;$('position').value='ip';$('range').value='balanced';$('profile').value='balanced';$('range-text-wrap').hidden=true;
  history=[{board:[],action:'raise',size:2.5},{board:['Qh','7h','2c'].map(parseCard),action:'bet',size:.5}];context();start();
};
$('export-analysis').onclick=()=>{
  if(!last)return;const blob=new Blob([JSON.stringify({version:1,model:'heuristic-rollout',config:lastInput,result:last},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='river-analysis.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
async function benchmarks(){try{const response=await fetch('./benchmarks/latest.json');if(!response.ok)return;const report=await response.json();const rows=[['独立牌型对照',`${report.evaluator.hands.toLocaleString()} 手牌 · ${report.evaluator.categoryMismatches} 不一致`],['赢家 / 平局对照',`${report.evaluator.deals.toLocaleString()} 牌局 · ${report.evaluator.winnerMismatches} 不一致`],['河牌 EV 最大绝对误差',`${Math.max(...report.action.cases.map(c=>c.absoluteError)).toFixed(3)} BB`],['基准参考版本',`pokersolver ${report.referenceVersion}`],['模型内相对过牌 / 跟注',`+${Math.min(...report.action.strategyComparison.map(c=>c.improvement)).toFixed(2)}～+${Math.max(...report.action.strategyComparison.map(c=>c.improvement)).toFixed(2)} BB`]];$('benchmark-results').replaceChildren(...rows.map(([label,value])=>{const row=document.createElement('div');row.className='benchmark-stat';const l=document.createElement('span');l.textContent=label;const v=document.createElement('strong');v.textContent=value;row.append(l,v);return row;}));const small=document.createElement('small');small.textContent=`河牌基准 ${report.action.cases.length} 个模型行动 / 策略组合，每个 ${report.action.trials.toLocaleString()} 次模拟。策略提升仅对应这 4 个河牌场景与设定模型，未验证实战效果。`;$('benchmark-results').append(small);}catch{ /* A benchmark run is optional for normal usage. */ }}
context();benchmarks();
