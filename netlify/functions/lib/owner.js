'use strict';
// Xoʻjayin buyruqlari: ishchi, oylik/avans/bonus, kommunal, oila, haqdor/qarzdor
const { tokenize, norm, cap, money, near, takeAmount, MIN, MAX } = require('./parse');

const WORDS = ['ishchi', 'oylik', 'avans', 'bonus', 'kommunal', 'oila', 'haqdor', 'qarzdor'];
const EX = {
  ishchi: 'ishchi Bobur 3000000', oylik: 'oylik Bobur 2000000', avans: 'avans Bobur 500000', bonus: 'bonus Bobur 100000',
  kommunal: 'kommunal elektr 150000', oila: 'oila oziq-ovqat 200000', haqdor: 'haqdor Ali 500000', qarzdor: 'qarzdor Ali 500000',
};
const KOM = [['Elektr', ['elektr', 'svet', 'tok']], ['Gaz', ['gaz']], ['Suv', ['suv']], ['Internet', ['internet', 'wifi']],
  ['Ijara', ['ijara', 'arenda']], ['Chiqindi', ['chiqindi', 'axlat']], ['Boshqa', ['boshqa']]];
const OIL = [['Oziq-ovqat', ['oziq', 'ovqat', 'non', 'bozor']], ['Kiyim', ['kiyim']], ['Bolalar', ['bola', 'bolalar']],
  ['Sogʻliq', ['sogliq', 'soglik', 'shifokor', 'dori']], ['Boshqa', ['boshqa']]];

const isOwnerCmd = text => WORDS.includes(tokenize(text)[0]);
const pick = (list, R) => { for (const t of R) for (const [name, keys] of list) if (keys.includes(t)) return name; return null; };

function findWorker(R, workers) {
  const typed = R.join(' ');
  const ex = workers.filter(w => norm(w) === typed);
  if (ex.length === 1) return ex[0];
  const c = workers.filter(w => { const n = norm(w); return n.startsWith(typed) || near(n, typed); });
  return c.length === 1 ? c[0] : null;
}

function parseOwner(text, ctx) {
  const t = tokenize(text), cmd = t[0];
  if (!WORDS.includes(cmd)) return null;
  const ex = EX[cmd], workers = (ctx && ctx.workers) || [];
  const am = takeAmount(t.slice(1));
  if (!am) return { error: `Summa topilmadi. Summani eng oxirida yozing.\nMisol: ${ex}` };
  if (am.amount < MIN) return { error: `Summa juda kichik (${money(am.amount)}).\nMisol: ${ex}` };
  if (am.amount > MAX) return { error: `Summa juda katta (${money(am.amount)}). Tekshirib qayta yozing.` };
  const R = am.rest, sum = am.amount;
  const need = m => ({ error: `${m}\nMisol: ${ex}` });

  if (cmd === 'ishchi') {
    if (!R.length) return need('Ishchi ismi kerak.');
    const kim = cap(R.join(' '));
    if (workers.some(w => norm(w) === norm(kim))) return { error: `"${kim}" ishchisi allaqachon bor.` };
    return { ok: true, table: 'owner_qarz', row: { tur: 'ishchi', kim, sum }, label: `👷 ISHCHI QOʻSHILDI\n${kim}\n💰 Oylik: ${money(sum)} so'm` };
  }
  if (['oylik', 'avans', 'bonus'].includes(cmd)) {
    if (!R.length) return need('Ishchi ismi kerak.');
    const w = findWorker(R, workers);
    if (!w) return { error: `Ishchi topilmadi: "${R.join(' ')}".\n${workers.length ? 'Bor ishchilar: ' + workers.join(', ') : 'Hali ishchi yoʻq.'}\nYangi ishchi: ${EX.ishchi}` };
    return { ok: true, table: 'owner_xarj', row: { guruh: 'oylik', obj: w, tur: cap(cmd), izoh: '', sum }, label: `💼 ${cap(cmd).toUpperCase()}\n${w}\n💰 ${money(sum)} so'm` };
  }
  if (cmd === 'kommunal') {
    const k = pick(KOM, R);
    if (!k) return need('Qaysi kommunal? (' + KOM.map(x => x[0]).join(', ') + ')');
    return { ok: true, table: 'owner_xarj', row: { guruh: 'kommunal', obj: k, tur: 'Toʻlov', izoh: '', sum }, label: `💡 KOMMUNAL\n${k}\n💰 ${money(sum)} so'm` };
  }
  if (cmd === 'oila') {
    if (!R.length) return need('Nima uchun? (' + OIL.map(x => x[0]).join(', ') + ')');
    const k = pick(OIL, R) || 'Boshqa';
    return { ok: true, table: 'owner_xarj', row: { guruh: 'oila', obj: '', tur: k, izoh: k === 'Boshqa' ? cap(R.join(' ')) : '', sum }, label: `🏠 OILA VA UY\n${k}\n💰 ${money(sum)} so'm` };
  }
  if (!R.length) return need('Kimning ismi kerak.');
  const kim = cap(R.join(' ')), h = cmd === 'haqdor';
  return { ok: true, table: 'owner_qarz', row: { tur: cmd, kim, sum, yopilgan: false, izoh: '' },
    label: `🤝 ${h ? 'HAQDOR (men toʻlashim kerak)' : 'QARZDOR (menga qaytarishi kerak)'}\n${kim}\n💰 ${money(sum)} so'm` };
}

module.exports = { parseOwner, isOwnerCmd, EX };
