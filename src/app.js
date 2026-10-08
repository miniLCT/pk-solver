import { RANKS, SUITS, CATEGORIES, parseCard, formatCard, validate } from './poker.js';
const $ = id => document.getElementById(id);
const symbols = ['♠', '♥', '♦', '♣'];
const state = { hero: [parseCard('As'), parseCard('Ks')], board: Array(5).fill(null), opponents: [[null, null]], iterations: 100000 };
let worker = null, pickerTarget = null;
const pct = n => `${n.toFixed(2)}%`;
function cardButton(card, onClick, label, active = false) {
  const button = document.createElement('button');
  button.className = `card ${card == null ? 'empty' : [1, 2].includes(Math.floor(card / 13)) ? 'red' : ''}${active ? ' active' : ''}`;
  button.type = 'button';
  if (card == null) { button.textContent = '+'; button.setAttribute('aria-label', label); }
  else {
    const suit = Math.floor(card / 13), rank = RANKS[card % 13].replace('T', '10');
    button.innerHTML = `${rank}<span class="suit">${symbols[suit]}</span><span class="big-suit">${symbols[suit]}</span>`;
    button.setAttribute('aria-label', `${label}，${rank}${symbols[suit]}`);
  }
  button.addEventListener('click', onClick);
  return button;
}
function groupOf(target) { return target.group === 'opponents' ? state.opponents[target.seat] : state[target.group]; }
function config() { return { hero: state.hero.filter(c => c != null), board: state.board.filter(c => c != null), opponents: state.opponents.map(h => h.filter(c => c != null)), iterations: state.iterations }; }
function invalidate() {
  if (worker) { worker.terminate(); worker = null; }
  $('calculate').disabled = false; $('cancel').hidden = true;
  $('progress-view').hidden = true; $('result-content').hidden = true; $('empty-result').hidden = false;
  $('result-status').textContent = '等待计算'; $('error').hidden = true;
  window.dispatchEvent(new CustomEvent('cards-changed'));
}
function render() {
  for (const group of ['hero', 'board']) {
    $(group).replaceChildren(...state[group].map((card, index) => cardButton(card, () => openPicker({ group, index }), `${group === 'hero' ? '手牌' : '公共牌'} ${index + 1}`)));
  }
  const count = state.board.filter(c => c != null).length;
  $('street').textContent = ({ 0: 'PRE-FLOP / 翻牌前', 3: 'FLOP / 翻牌', 4: 'TURN / 转牌', 5: 'RIVER / 河牌' })[count] || 'BOARD / 请补齐翻牌';
  $('hand-label').textContent = state.hero.every(c => c != null) ? state.hero.map(c => RANKS[c % 13] + symbols[Math.floor(c / 13)]).join('  ') : '选择你的两张手牌';
  $('opponent-count').textContent = state.opponents.length;
  $('remove-opponent').disabled = state.opponents.length === 1;
  $('add-opponent').disabled = state.opponents.length === 8;
  $('opponents').replaceChildren(...state.opponents.map((hand, seat) => {
    const row = document.createElement('div'); row.className = 'opponent';
    const label = document.createElement('span'); label.className = 'opponent-name'; label.textContent = `对手 ${seat + 1}`;
    const cards = document.createElement('div'); cards.className = 'cards';
    cards.replaceChildren(...hand.map((card, index) => cardButton(card, () => openPicker({ group: 'opponents', seat, index }), `对手 ${seat + 1} 手牌 ${index + 1}`)));
    const clear = document.createElement('button'); clear.className = 'opponent-clear'; clear.textContent = '×'; clear.setAttribute('aria-label', `清空对手 ${seat + 1} 手牌`);
    clear.onclick = () => { state.opponents[seat] = [null, null]; invalidate(); render(); };
    row.append(label, cards, clear); return row;
  }));
  document.querySelectorAll('[data-iterations]').forEach(b => { const selected = Number(b.dataset.iterations) === state.iterations; b.classList.toggle('selected', selected); b.setAttribute('aria-pressed', selected); });
}
function openPicker(target) { pickerTarget = target; renderPicker(); $('card-picker').showModal(); }
function renderPicker() {
  const group = groupOf(pickerTarget);
  $('picker-title').textContent = pickerTarget.group === 'hero' ? '选择你的手牌' : pickerTarget.group === 'board' ? '选择公共牌' : `选择对手 ${pickerTarget.seat + 1} 手牌`;
  $('picker-preview').replaceChildren(...group.map((c, i) => cardButton(c, () => { pickerTarget.index = i; renderPicker(); }, `当前牌位 ${i + 1}`, pickerTarget.index === i)));
  const used = new Set([...state.hero, ...state.board, ...state.opponents.flat()].filter(c => c != null));
  const buttons = [];
  for (let suit = 0; suit < 4; suit++) for (let rank = 12; rank >= 0; rank--) {
    const card = suit * 13 + rank;
    const b = cardButton(card, () => {
      group[pickerTarget.index] = card; invalidate(); render();
      const next = group.findIndex(c => c == null);
      if (next >= 0) pickerTarget.index = next;
      renderPicker();
    }, '选择');
    b.disabled = used.has(card); buttons.push(b);
  }
  $('deck').replaceChildren(...buttons);
}
function showError(message) { $('error').textContent = message; $('error').hidden = false; }
function resultView(result) {
  $('empty-result').hidden = true; $('progress-view').hidden = true; $('result-content').hidden = false;
  const hero = result.players[0];
  $('equity').textContent = pct(hero.equity); $('equity-ring').style.setProperty('--equity', pct(hero.equity));
  for (const key of ['win', 'tie', 'lose']) $(key).textContent = pct(hero[key]);
  $('equity-explanation').textContent = `平均每 100 单位底池，分得 ${hero.equity.toFixed(2)} 单位。`;
  $('result-status').textContent = result.method === 'exact' ? '精确枚举' : '蒙特卡洛模拟';
  $('player-results').replaceChildren(...result.players.map((player, i) => {
    const row = document.createElement('div'); row.className = 'player-row';
    const hand = i === 0 ? state.hero : state.opponents[i - 1];
    const handText = hand.every(c => c != null) ? hand.map(formatCard).join(' ') : '随机手牌';
    row.innerHTML = `<div class="player-label"><span>${i === 0 ? '你' : `对手 ${i}`} · ${handText}</span><b>${pct(player.equity)}</b></div><div class="bar-track"><div class="bar-fill" style="width:${player.equity}%"></div></div>`;
    return row;
  }));
  $('categories').replaceChildren(...CATEGORIES.map((name, i) => {
    const row = document.createElement('div'); row.className = 'category-row';
    row.innerHTML = `<span>${name}</span><div class="bar-track"><div class="bar-fill" style="width:${result.categories[i]}%"></div></div><span class="percent">${pct(result.categories[i])}</span>`; return row;
  }));
  $('result-meta').textContent = `${result.method === 'exact' ? '枚举' : '模拟'} ${result.samples.toLocaleString('zh-CN')} 个牌局 · ${(result.elapsed / 1000).toFixed(2)} 秒${result.method === 'exact' ? ' · 无抽样误差' : ` · 权益 95% 保守误差上界 ±${result.errorBound.toFixed(2)} 个百分点`}。${result.method === 'exact' ? '' : '重复模拟的结果会略有差异。'}`;
}
function start() {
  invalidate();
  const input = config();
  try { validate(input); } catch (e) { showError(e.message); return; }
  $('empty-result').hidden = true; $('progress-view').hidden = false; $('calculate').disabled = true; $('cancel').hidden = false;
  $('progress').value = 0; $('progress-text').textContent = '准备计算…'; $('result-status').textContent = '计算中';
  try { worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }); }
  catch (e) { invalidate(); showError(`无法启动计算：${e.message}`); return; }
  const activeWorker = worker;
  worker.onmessage = ({ data }) => {
    if (worker !== activeWorker) return;
    if (data.type === 'progress') {
      $('progress').value = data.done / data.total * 100;
      $('progress-text').textContent = `${data.done.toLocaleString('zh-CN')} / ${data.total.toLocaleString('zh-CN')} · ${Math.floor(data.done / data.total * 100)}%`;
    } else {
      worker.terminate(); worker = null; $('calculate').disabled = false; $('cancel').hidden = true;
      if (data.type === 'error') { invalidate(); showError(data.message); } else resultView(data.result);
    }
  };
  worker.onerror = () => { if (worker !== activeWorker) return; invalidate(); showError('计算线程出错，请重试或刷新页面'); };
  worker.postMessage(input);
}
$('calculate').onclick = start;
$('cancel').onclick = invalidate;
$('add-opponent').onclick = () => { if (state.opponents.length < 8) state.opponents.push([null, null]); invalidate(); render(); };
$('remove-opponent').onclick = () => { if (state.opponents.length > 1) state.opponents.pop(); invalidate(); render(); };
$('clear-board').onclick = () => { state.board.fill(null); invalidate(); render(); };
$('reset').onclick = () => { state.hero = [null, null]; state.board.fill(null); state.opponents = [[null, null]]; state.iterations = 100000; invalidate(); render(); };
document.querySelectorAll('[data-iterations]').forEach(b => b.onclick = () => { state.iterations = Number(b.dataset.iterations); invalidate(); render(); });
document.querySelectorAll('[data-example]').forEach(b => b.onclick = () => {
  state.board.fill(null); state.opponents = [[null, null]];
  if (b.dataset.example === 'draw') { state.hero = ['Ah', 'Kh'].map(parseCard); state.board = [...['Qh', '7h', '2c'].map(parseCard), null, null]; }
  else { state.hero = ['As', 'Ah'].map(parseCard); if (b.dataset.example === 'duel') state.opponents = [['Ks', 'Kh'].map(parseCard)]; }
  render(); start();
});
$('card-picker').addEventListener('close', () => {
  const compact = state.board.filter(c => c != null);
  while (compact.length < 5) compact.push(null);
  if (compact.some((c, i) => c !== state.board[i])) { state.board = compact; invalidate(); render(); }
});
$('picker-close').onclick = $('picker-done').onclick = () => $('card-picker').close();
$('clear-slot').onclick = () => { groupOf(pickerTarget)[pickerTarget.index] = null; invalidate(); render(); renderPicker(); };
$('help-open').onclick = () => $('help').showModal(); $('help-close').onclick = () => $('help').close();
for (const id of ['help', 'card-picker']) $(id).addEventListener('click', e => { if (e.target === $(id)) { const r = $(id).getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) $(id).close(); } });
window.river = { getConfig: config, state, render, invalidate };
render();
