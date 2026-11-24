'use strict';
// Guruh xabarini tushunadigan toza qism (tarmoqqa ulanmaydi, shuning uchun sinash oson).

const CYR = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'j',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'x',ц:'ts',ч:'ch',ш:'sh',щ:'sh',ъ:"'",ы:'i',ь:'',э:'e',ю:'yu',я:'ya',ў:"o'",қ:'q',ғ:"g'",ҳ:'h' };
const CMD = { yuk:'yuk', yuq:'yuk', oldim:'oldim', oldi:'oldim', oldik:'oldim', olindi:'oldim', tolov:'oldim', rasxod:'rasxod', rasxot:'rasxod', rashod:'rasxod', xarajat:'rasxod' };
const EX = { yuk:'yuk Ali Vali isuzu 300000', oldim:'oldim Ali 200000', rasxod:'rasxod yoqilgi isuzu 500000' };
const MIN = 1000, MAX = 2e9;
const GROUPED = /^\d{1,3}([.,]\d{3})+$/;

function norm(s) {
  s = String(s || '').toLowerCase();
  let o = '';
  for (const ch of s) o += CYR[ch] !== undefined ? CYR[ch] : ch;
  return o.replace(/[ʻʼ`´‘’'ʹ]/g, '').replace(/[^a-z0-9.,\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
function tokenize(text) {
  text = String(text || '').replace(/^\/(\w+)@\w+/, '/$1');
  const t = norm(text).split(' ')
    .map(x => /\d/.test(x) ? x.replace(/^[.,]+|[.,]+$/g, '') : x.replace(/[.,]/g, ''))
    .filter(Boolean);
  const o = []; // "sprinter 1" -> "sprinter1"
  for (let i = 0; i < t.length; i++) {
    if (t[i] === 'sprinter' && /^[12]$/.test(t[i + 1] || '')) { o.push('sprinter' + t[i + 1]); i++; } else o.push(t[i]);
  }
  return o;
}
const cap = s => s.replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase());
const money = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

// ikki soʻz bir harfga farq qilsa true (yozuv xatosi)
function near(a, b, minLen = 4) {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < minLen || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  return s.slice(i) === l.slice(i + 1);
}

// Summa oxirida: 300000 | 300 000 | 300.000 | 300 ming | 300k | 1.5 mln
function takeAmount(tokens) {
  const t = [...tokens];
  let mult = 1;
  const w = t[t.length - 1];
  if (w === 'ming') { mult = 1e3; t.pop(); }
  else if (w === 'mln' || w === 'million' || w === 'milyon') { mult = 1e6; t.pop(); }
  const last = t.pop();
  if (last === undefined) return null;
  let amount;
  if (/^\d+k$/.test(last) && mult === 1) amount = Number(last.slice(0, -1)) * 1e3;
  else if (mult > 1 && /^\d+([.,]\d+)?$/.test(last)) amount = Math.round(Number(last.replace(',', '.')) * mult);
  else if (GROUPED.test(last)) amount = Number(last.replace(/[.,]/g, '')) * mult;
  else if (/^\d+$/.test(last)) {
    const parts = [last];
    if (mult === 1) while (t.length && /^\d{1,3}$/.test(t[t.length - 1]) && parts[0].length === 3) parts.unshift(t.pop());
    amount = Number(parts.join('')) * mult;
  } else return null;
  return { amount, rest: t };
}

const prefix = (typed, c) => typed.length <= c.ct.length && typed.every((t, i) => c.ct[i].startsWith(t));
const fuzzy = (typed, c) => typed.length <= c.ct.length && typed.every((t, i) => c.ct[i].startsWith(t) || near(c.ct[i], t));
const mk = (field, question, options) => ({ field, question, options });
const vmap = ctx => { const m = new Map(); for (const v of ctx.vehicles) for (const k of v.keys) if (k) m.set(k, v.code); return m; };

// Bitta mijoz oʻrni: aniq nom (0) -> yagona boshlanish (1) -> xato/koʻp variant (nomzodlar)
function slot(typed, ctx) {
  const ex = ctx.clients.filter(c => c.name_norm === typed.join(' '));
  if (ex.length === 1) return { client: ex[0], level: 0 };
  if (typed[0].length >= 3) {
    const pr = ctx.clients.filter(c => prefix(typed, c));
    if (pr.length === 1) return { client: pr[0], level: 1 };
  }
  const fz = ctx.clients.filter(c => fuzzy(typed, c));
  return fz.length ? { cands: fz } : null;
}
const forced = (typed, id, ctx) => { const c = ctx.clients.find(x => String(x.id) === String(id)); return c && fuzzy(typed, c) ? { client: c, level: 0 } : null; };
const opts = list => list.slice(0, 6).map(c => ({ value: String(c.id), label: c.name }));
const notFound = R => ({ error: `Mijoz topilmadi: "${R.join(' ')}".\nIsmni tekshiring yoki yangisini qoʻshing:\nmijoz Ali qoqon 901234567` });

function findPair(R, ctx, picks) {
  const sp = [];
  for (let i = 1; i < R.length; i++) {
    const ta = R.slice(0, i), tb = R.slice(i);
    const A = picks.a ? forced(ta, picks.a, ctx) : slot(ta, ctx);
    const B = picks.b ? forced(tb, picks.b, ctx) : slot(tb, ctx);
    if (A && B) sp.push({ A, B, ta, tb });
  }
  if (!sp.length) return notFound(R);
  const full = sp.filter(o => o.A.client && o.B.client);
  if (full.length) {
    const sc = o => o.A.level + o.B.level, min = Math.min(...full.map(sc));
    const best = full.filter(o => sc(o) === min);
    const pairs = new Map(best.map(o => [o.A.client.id + '|' + o.B.client.id, o]));
    if (pairs.size === 1) {
      const o = best[0];
      if (String(o.A.client.id) === String(o.B.client.id)) return { error: '"Kimdan" va "Kimga" bir xil mijoz boʻlib qoldi.' };
      return { a: o.A.client, b: o.B.client };
    }
    return { ask: mk('pair', 'Qaysi biri?', [...pairs.entries()].slice(0, 6).map(([k, o]) => ({ value: k, label: `${o.A.client.name} → ${o.B.client.name}` }))) };
  }
  const unres = o => (o.A.client ? 0 : 1) + (o.B.client ? 0 : 1);
  const o = sp.sort((x, y) => unres(x) - unres(y))[0];
  if (!o.A.client) return { ask: mk('a', `Kimdan: "${o.ta.join(' ')}" — qaysi mijoz?`, opts(o.A.cands)) };
  return { ask: mk('b', `Kimga: "${o.tb.join(' ')}" — qaysi mijoz?`, opts(o.B.cands)) };
}

// ctx = { clients:[{id,name,name_norm,ct:[...],hud}], vehicles:[{code,name,keys:[...]}] }
// natija: null (bizniki emas) | {error} | {ask:{field,question,options}} | {ok:true,kind,...}
function parse(text, ctx, picks) {
  picks = picks || {};
  const tokens = tokenize(text);
  if (!tokens.length) return null;
  const cmd = CMD[tokens[0]];
  if (!cmd) return null;
  const ex = EX[cmd];
  const am = takeAmount(tokens.slice(1));
  if (!am) return { error: `Summa topilmadi. Summani eng oxirida yozing.\nMisol: ${ex}` };
  if (am.amount < MIN) return { error: `Summa juda kichik (${money(am.amount)}). 300 ming boʻlsa 300000 deb yozing.\nMisol: ${ex}` };
  if (am.amount > MAX) return { error: `Summa juda katta (${money(am.amount)}). Tekshirib qayta yozing.` };

  let R = am.rest, vehicle = null;
  if (cmd !== 'oldim') {
    const vm = vmap(ctx);
    if (R.includes('sprinter')) return { error: 'Sprinter 1 yoki 2? "sprinter1" yoki "sprinter2" deb yozing.' };
    if (picks.v) { vehicle = picks.v; R = R.slice(0, -1); }
    else {
      const hits = R.filter(t => vm.has(t));
      if (hits.length > 1) return { error: `Bitta mashina yozing.\nMisol: ${ex}` };
      if (hits.length === 1) { vehicle = vm.get(hits[0]); R = R.filter(t => t !== hits[0]); }
      else if (R.length) {
        const lt = R[R.length - 1], cand = ctx.vehicles.filter(v => v.keys.some(k => near(k, lt)));
        if (cand.length) return { ask: mk('v', `"${lt}" — qaysi mashina?`, cand.map(v => ({ value: v.code, label: v.name }))) };
      }
    }
  }
  if (cmd === 'yuk' && !vehicle) return { error: `Mashina yozilmagan. Mashinalar: ${ctx.vehicles.map(v => v.code).join(', ')}\nMisol: ${ex}` };

  if (cmd === 'rasxod') {
    if (!R.length) return { error: `Nima uchun rasxod? (yoqilgi, tamir, non...)\nMisol: ${ex}` };
    return { ok: true, kind: 'rasxod', note: cap(R.join(' ')), vehicle, amount: am.amount };
  }
  if (cmd === 'oldim') {
    if (!R.length) return { error: `Mijoz ismi va summa kerak.\nMisol: ${ex}` };
    const s = picks.c ? forced(R, picks.c, ctx) : slot(R, ctx);
    if (!s) return notFound(R);
    if (s.cands) return { ask: mk('c', `"${R.join(' ')}" — qaysi mijoz?`, opts(s.cands)) };
    return { ok: true, kind: 'oldim', client: s.client, amount: am.amount };
  }
  if (R.length < 2) return { error: `Ikkita mijoz kerak: kimdan va kimga.\nMisol: ${ex}` };
  const f = findPair(R, ctx, picks);
  if (f.error || f.ask) return f;
  return { ok: true, kind: 'yuk', a: f.a, b: f.b, vehicle, amount: am.amount };
}

module.exports = { parse, norm, tokenize, cap, money, near, takeAmount, MIN, MAX };
