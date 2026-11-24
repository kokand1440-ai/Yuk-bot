'use strict';
// Telegram guruh -> Supabase. Qolip: yuk / oldim / rasxod / mijoz + yetdi, yolda, qaytdi, bekor
const E = process.env;
const { parse, norm: pnorm } = require('./lib/parse');
const { parseOwner, isOwnerCmd, EX: OEX } = require('./lib/owner');
const TG = `https://api.telegram.org/bot${E.BOT_TOKEN}`;
const REST = `${E.SUPABASE_URL}/rest/v1`;
const HDR = { apikey: E.SUPABASE_KEY, Authorization: `Bearer ${E.SUPABASE_KEY}`, 'Content-Type': 'application/json' };

const MASH = {
  isuzu: 'Isuzu 455', sprinter1: 'Sprinter 097 (sariq)', sprinter2: 'Sprinter 097 (oq)',
  kobalt: 'Kobalt 097', damas: 'Damas 097', labo: 'Labo 452',
};
const EX = {
  yuk: 'yuk Ali Vali isuzu 300000',
  oldim: 'oldim Ali 200000',
  rasxod: 'rasxod yoqilgi isuzu 500000',
  mijoz: 'mijoz Ali qoqon 901234567',
};
const HELP = `📖 QANDAY YOZILADI

🚚 Yuk:
yuk Ali Vali isuzu 300000
(1-mijoz — kimdan, 2-mijoz — kimga)

💵 Pul oldim:
oldim Ali 200000

🧾 Rasxod:
rasxod yoqilgi isuzu 500000
rasxod non 20000

👤 Yangi mijoz:
mijoz Ali qoqon 901234567

📦 Yuk yetsa — bot yozgan xabarga JAVOB qilib "yetdi" deb yozing.
❌ Xato bo'lsa — shu xabarga javob qilib "bekor" deb yozing.

🚛 Mashinalar: ${Object.keys(MASH).join(', ')}
⚠️ Bot javob bermasa — yozilmagan!`;

// ---------- yordamchilar ----------
const CY = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'j',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'x',ц:'s',ч:'ch',ш:'sh',щ:'sh',ъ:'',ы:'i',ь:'',э:'e',ю:'yu',я:'ya',қ:'q',ғ:'g',ў:'o',ҳ:'h' };
const norm = s => String(s || '').toLowerCase()
  .replace(/[а-яёқғўҳ]/g, c => CY[c] ?? c)
  .replace(/[ʻʼ'’‘`´]/g, '')
  .replace(/\s+/g, ' ').trim();
const fmt = n => Number(n).toLocaleString('ru-RU').replace(/\u00a0/g, ' ');
const today = () => new Date(Date.now() + 5 * 36e5).toISOString().slice(0, 10); // Toshkent
const KW = {
  yuk: ['yuk', 'yuq'], oldim: ['oldim', 'oldik', 'olindi'],
  rasxod: ['rasxod', 'rasxot', 'rashod', 'xarajat'], mijoz: ['mijoz', 'klient'],
  yolda: ['yolda'], yetdi: ['yetdi', 'yetti', 'yetkazdim'], qaytdi: ['qaytdi', 'qaytgan'], bekor: ['bekor'],
};
const kind = w => Object.keys(KW).find(k => KW[k].includes(w));

function parseSum(s) {
  const m = s.match(/^(.*?\S)\s+(\d[\d\s.,]*)\s*(ming|mln|k)?$/);
  if (!m) return null;
  const v = m[3]
    ? parseFloat(m[2].replace(/\s/g, '').replace(',', '.')) * (m[3] === 'mln' ? 1e6 : 1e3)
    : Number(m[2].replace(/\D/g, ''));
  return isFinite(v) ? { head: m[1], sum: Math.round(v) } : null;
}
function find(q, cl) {
  const ex = cl.filter(c => c.n === q);
  if (ex.length) return ex;
  const w = q.split(' ');
  return cl.filter(c => { const cw = c.n.split(' '); return w.every(x => cw.some(y => y.startsWith(x))); });
}
function pair(names, cl, tail) {
  const out = [];
  for (let i = 1; i < names.length; i++) {
    const A = find(names.slice(0, i).join(' '), cl), B = find(names.slice(i).join(' '), cl);
    if (A.length && B.length) out.push([A, B]);
  }
  if (!out.length) return { err: `Mijoz topilmadi. Ismni tekshiring yoki yangisini qo'shing:\n${EX.mijoz}` };
  const opts = [];
  out.forEach(([A, B]) => A.forEach(a => B.forEach(b => opts.push([a, b]))));
  if (opts.length === 1) return { a: opts[0][0], b: opts[0][1] };
  return { err: 'Qaysi mijoz? To\'liq yozib qayta yuboring:\n' + opts.slice(0, 6).map(([a, b]) => `yuk ${a.ism} ${b.ism} ${tail}`).join('\n') };
}
function turMash(s) {
  if (/yoqilg|benzin|gaz|metan|propan|solyar|dizel/.test(s)) return 'Yoqilgʻi';
  if (/tamir|remont/.test(s)) return 'Taʼmir';
  if (/shina|ehtiyot|zapchast|balon|akkumulyator/.test(s)) return 'Shina / ehtiyot qism';
  if (/yol|jarima|gai|shtraf/.test(s)) return 'Yoʻl haqi / jarima';
  return 'Boshqa';
}

// ---------- tarmoq ----------
async function sb(path, method = 'GET', body, prefer) {
  const r = await fetch(REST + path, { method, headers: { ...HDR, ...(prefer ? { Prefer: prefer } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const tx = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${tx}`);
  return tx ? JSON.parse(tx) : [];
}
async function say(chat, text, reply, extra) {
  try {
    const r = await fetch(TG + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, reply_to_message_id: reply, allow_sending_without_reply: true, ...extra }) });
    const j = await r.json();
    return j.result && j.result.message_id;
  } catch (e) { console.error('say', e); }
}
async function allClients() {
  let out = [], from = 0;
  for (;;) {
    const r = await fetch(`${REST}/mijoz?select=id,ism,hud,tel&del=eq.false`, { headers: { ...HDR, 'Range-Unit': 'items', Range: `${from}-${from + 999}` } });
    if (!r.ok) throw new Error('mijoz ' + r.status);
    const a = await r.json(); out = out.concat(a);
    if (a.length < 1000 || from > 20000) break;
    from += 1000;
  }
  return out.map(c => ({ ...c, n: norm(c.ism) }));
}
const ins = async (table, row) => (await sb(`/${table}?on_conflict=tg_msg`, 'POST', row, 'resolution=ignore-duplicates,return=representation'))[0];
const patch = (table, id, body) => sb(`/${table}?id=eq.${id}`, 'PATCH', body);

// ---------- asosiy ----------
async function handle(u) {
  if (u.callback_query) return onCallback(u.callback_query);
  const em = u.edited_message;
  if (em && em.text && String(em.chat.id) === String(E.GROUP_ID) && kind(norm(em.text).split(' ')[0])) {
    await say(em.chat.id, '✏️ Tahrirlangan xabar qabul qilinmaydi. Xato bo\'lsa: eskisiga javob qilib "bekor" deb yozing va qaytadan yozing.', em.message_id);
    return;
  }
  const m = u.message;
  if (!m || !m.text) return;
  const chat = m.chat.id, mid = m.message_id;
  const raw = m.text.replace(/^(\/\w+)@\w+/, '$1').trim();
  if (/^\/id\b/i.test(raw)) return void (await say(chat, `Chat ID: ${chat}\nSizning ID: ${m.from.id}`, mid));
  if (String(chat) !== String(E.GROUP_ID) && !(m.chat.type === 'private' && String(m.from.id) === String(E.BOSS_ID))) return;

  const by = String(m.from.id);
  const name = [m.from.first_name, m.from.last_name].filter(Boolean).join(' ') || m.from.username || by;
  if (/^\/(start|help|yordam)\b/i.test(raw)) return void (await say(chat, HELP, mid));

  const key = `${chat}:${mid}`;
  const isBoss = by === String(E.BOSS_ID);
  if (isBoss && /^\/(xojayin|hojayin)\b/i.test(raw))
    return void (await say(chat, '👑 XOʻJAYIN BUYRUQLARI\n\n' + Object.values(OEX).join('\n') + '\n\nIshchi oldin "ishchi" bilan qoʻshiladi. Kommunal: elektr, gaz, suv, internet, ijara, chiqindi. Oila: oziq-ovqat, kiyim, bolalar, sogliq. Xato boʻlsa: xabarga javob qilib "bekor".', mid));
  if (isOwnerCmd(raw)) {
    if (!isBoss) { const p = parseSum(norm(raw)); if (p && p.sum >= 1000) await say(chat, '🔒 Bu buyruq faqat xoʻjayin uchun.', mid); return; }
    const wk = await sb('/owner_qarz?select=kim&tur=eq.ishchi&del=eq.false');
    const ow = parseOwner(raw, { workers: wk.map(x => x.kim) });
    if (ow.error) return void (await say(chat, `❌ ${ow.error}`, mid));
    const row = await ins(ow.table, { ...ow.row, sana: today(), t: Date.now(), by, by_name: name, tg_msg: key });
    if (!row) return;
    await jurnal(row.no, ow.table, by, { amal: 'yaratildi' });
    const bm = await say(chat, `✅ #${row.no} ${ow.label}\n✍ ${name}\n\nXato bo'lsa: shu xabarga javob qilib "bekor" deb yozing.`, mid);
    if (bm) await patch(ow.table, row.id, { bot_msg: bm });
    return;
  }

  const text = norm(raw.replace(/^\//, '')).replace(/sprinter\s*(\d)/g, 'sprinter$1');
  const kw = kind(text.split(' ')[0]);
  const fail = (msg, ex) => say(chat, `❌ ${msg}${ex ? `\nMisol: ${EX[ex]}` : ''}`, mid);

  if (!kw) { // oddiy suhbat — jim; lekin pulga o'xshasa ogohlantiramiz
    const p = parseSum(text);
    if (p && p.sum >= 1000) await fail('Birinchi so\'z yuk, oldim yoki rasxod bo\'lishi kerak. Yozuv saqlanmadi.\n/yordam');
    return;
  }

  // --- holat / bekor ---
  if (['yolda', 'yetdi', 'qaytdi', 'bekor'].includes(kw)) {
    const args = text.split(' ').slice(1);
    const num = (args[0] || '').match(/^#?(\d+)$/);
    const reason = (num ? args.slice(1) : args).join(' ');
    let x = null;
    if (num) {
      for (const t of ['amal', 'xarj', 'owner_xarj', 'owner_qarz']) { const r = (await sb(`/${t}?no=eq.${num[1]}&select=*`))[0]; if (r) { x = { t, r }; break; } }
    } else if (m.reply_to_message) {
      const rid = m.reply_to_message.message_id, k = encodeURIComponent(`${chat}:${rid}`);
      for (const t of ['amal', 'xarj', 'owner_xarj', 'owner_qarz']) {
        const r = (await sb(`/${t}?tg_msg=eq.${k}&select=*`))[0] || (await sb(`/${t}?bot_msg=eq.${rid}&select=*`))[0];
        if (r) { x = { t, r }; break; }
      }
    }
    if (!x) return void (await fail(`Qaysi yozuv? Bot yozgan xabarga JAVOB qilib "${text.split(' ')[0]}" deb yozing yoki raqam bilan: ${text.split(' ')[0]} 145`));
    const r = x.r, no = `#${r.no}`;
    if (r.del || r.holat === 'bekor') return void (await fail(`${no} allaqachon bekor qilingan.`));
    if (kw === 'bekor') {
      if (by !== String(r.by) && by !== String(E.BOSS_ID)) return void (await fail('Faqat yozgan odam yoki xo\'jayin bekor qila oladi.'));
      if (x.t === 'amal' && r.tur === 'yuk') await patch('amal', r.id, { holat: 'bekor', hol_t: Date.now(), hol_by: by });
      else await patch(x.t, r.id, { del: true, del_t: Date.now(), del_by: by });
      await jurnal(r.no, x.t, by, { amal: 'bekor' });
      return void (await say(chat, `🗑 ${no} bekor qilindi.`, mid));
    }
    if (x.t !== 'amal' || r.tur !== 'yuk') return void (await fail('Holat faqat yuk uchun.'));
    await patch('amal', r.id, { holat: kw, hol_t: Date.now(), hol_by: by, ...(kw === 'qaytdi' && reason ? { q_sabab: reason } : {}) });
    await jurnal(r.no, 'amal', by, { amal: kw, ...(reason && kw === 'qaytdi' ? { sabab: reason } : {}) });
    const L = { yolda: '🚚 Yo\'lda', yetdi: '✅ Yetkazildi', qaytdi: '↩️ Qaytgan yuk' }[kw];
    return void (await say(chat, `${L}: ${no}${reason && kw === 'qaytdi' ? '\nSabab: ' + reason : ''}`, mid));
  }

  // --- yangi mijoz ---
  if (kw === 'mijoz') {
    let t = text.split(' ').slice(1), tel = '';
    while (t.length && /^[\d+]+$/.test(t[t.length - 1])) tel = t.pop() + tel;
    let hud = null;
    if (t.slice(-2).join(' ') === 'abu saxiy') { hud = 'Abu Saxiy'; t = t.slice(0, -2); }
    else if (['abu', 'abusaxiy'].includes(t[t.length - 1])) { hud = 'Abu Saxiy'; t.pop(); }
    else if (['qoqon', 'kokand'].includes(t[t.length - 1])) { hud = 'Qoʻqon'; t.pop(); }
    if (!hud || !t.length) return void (await fail('Mijoz ismi va hududi (qoqon yoki abu) kerak.', 'mijoz'));
    // ism asl yozilishida saqlanadi (bosh harf bilan)
    const orig = raw.replace(/^\S+\s+/, '').split(/\s+/).slice(0, t.length).join(' ');
    const cl = await allClients();
    if (cl.some(c => c.n === norm(orig))) return void (await fail(`"${orig}" nomli mijoz allaqachon bor.`));
    await sb('/mijoz', 'POST', { ism: orig, hud, tel: tel || null, t: Date.now(), by });
    return void (await say(chat, `👤 Mijoz qo'shildi: ${orig} (${hud})${tel ? ' ' + tel : ''}`, mid));
  }

  // --- yuk / oldim / rasxod: parser orqali ---
  const ctx = await loadCtx();
  const res = parse(raw, ctx);
  if (!res) return;
  if (res.error) return void (await fail(res.error));
  if (res.ask) return void (await askUser(m, res.ask, {}, raw, name));
  return void (await record(res, { chat, mid, by, name, key }));
}

// ---------- parser bilan ishlash ----------
async function loadCtx() {
  const cl = await allClients();
  return {
    clients: cl.map(c => { const n = pnorm(c.ism); return { id: c.id, name: c.ism, hud: c.hud, name_norm: n, ct: n.split(' ') }; }).filter(c => c.name_norm),
    vehicles: Object.entries(MASH).map(([code, name]) => ({ code, name, keys: [code] })),
  };
}
const jurnal = (no, jadval, kim, tafsilot) =>
  sb('/jurnal', 'POST', { no, jadval, kim: String(kim), tafsilot }, 'return=minimal').catch(e => console.error('jurnal', e.message));

async function record(res, x) {
  const { chat, mid, by, name, key } = x;
  const base = { sana: today(), t: Date.now(), by, by_name: name, tg_msg: key };
  if (res.kind === 'yuk') {
    const row = await ins('amal', {
      tur: 'yuk', mijoz: res.a.id, kimdan: res.a.id, kimga: res.b.id, tol: 'kimdan',
      yon: res.a.hud === 'Abu Saxiy' ? 'Abu Saxiy → Qoʻqon' : 'Qoʻqon → Abu Saxiy',
      veh: MASH[res.vehicle], sum: res.amount, holat: 'yolda', hol_t: Date.now(), hol_by: by, ...base,
    });
    if (!row) return;
    await jurnal(row.no, 'amal', by, { amal: 'yaratildi', tur: 'yuk' });
    const bm = await say(chat, `✅ #${row.no} YUK\n${res.a.name} → ${res.b.name}\n🚛 ${MASH[res.vehicle]}\n💰 ${fmt(res.amount)} so'm\n✍ ${name}\n\nYetsa: shu xabarga javob qilib "yetdi" deb yozing.\nXato bo'lsa: "bekor".`, mid);
    if (bm) await patch('amal', row.id, { bot_msg: bm });
    return;
  }
  if (res.kind === 'oldim') {
    const row = await ins('amal', { tur: 'tolov', mijoz: res.client.id, sum: res.amount, ...base });
    if (!row) return;
    await jurnal(row.no, 'amal', by, { amal: 'yaratildi', tur: 'tolov' });
    const bm = await say(chat, `✅ #${row.no} PUL OLINDI\n${res.client.name}\n💰 ${fmt(res.amount)} so'm\n✍ ${name}\n\nXato bo'lsa: shu xabarga javob qilib "bekor" deb yozing.`, mid);
    if (bm) await patch('amal', row.id, { bot_msg: bm });
    return;
  }
  const nima = res.note, veh = res.vehicle;
  const row = await ins('xarj', {
    guruh: veh ? 'mashina' : 'kunlik', obj: veh ? MASH[veh] : '',
    tur: veh ? turMash(nima.toLowerCase()) : nima, izoh: veh ? nima : '', sum: res.amount, ...base,
  });
  if (!row) return;
  await jurnal(row.no, 'xarj', by, { amal: 'yaratildi' });
  const bm = await say(chat, `✅ #${row.no} RASXOD\n${veh ? '🚛 ' + MASH[veh] + ' — ' : ''}${nima}\n💰 ${fmt(res.amount)} so'm\n✍ ${name}\n\nXato bo'lsa: shu xabarga javob qilib "bekor" deb yozing.`, mid);
  if (bm) await patch('xarj', row.id, { bot_msg: bm });
}

// ---------- tugma bilan aniqlashtirish ----------
const kb = (pid, ask) => ({ inline_keyboard: [
  ...ask.options.map((o, i) => [{ text: o.label, callback_data: `p:${pid}:${i}` }]),
  [{ text: '❌ Bekor', callback_data: `p:${pid}:x` }],
] });
async function askUser(m, ask, picks, text, name) {
  sb(`/kutish?t=lt.${encodeURIComponent(new Date(Date.now() - 864e5).toISOString())}`, 'DELETE').catch(() => {});
  const row = (await sb('/kutish', 'POST', { chat: m.chat.id, msg: m.message_id, uid: String(m.from.id), uname: name, text, picks, ask }, 'return=representation'))[0];
  await say(m.chat.id, ask.question, m.message_id, { reply_markup: kb(row.id, ask) });
}
async function tgCall(method, body) {
  try { return await (await fetch(`${TG}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json(); }
  catch (e) { console.error(method, e); return {}; }
}
async function onCallback(q) {
  const ack = text => tgCall('answerCallbackQuery', { callback_query_id: q.id, text });
  const msg = q.message;
  if (!msg || String(msg.chat.id) !== String(E.GROUP_ID)) return ack();
  const [, pid, idx] = String(q.data || '').split(':');
  const p = pid && (await sb(`/kutish?id=eq.${Number(pid)}&select=*`))[0];
  if (!p) return ack('Muddati tugagan, qayta yozing.');
  if (String(q.from.id) !== String(p.uid)) return ack('Bu savol boshqa odamga.');
  const edit = (text, extra) => tgCall('editMessageText', { chat_id: msg.chat.id, message_id: msg.message_id, text, ...extra });
  const drop = () => sb(`/kutish?id=eq.${p.id}`, 'DELETE');
  if (idx === 'x') { await drop(); await edit('❌ Bekor qilindi'); return ack(); }
  if (Date.now() - new Date(p.t) > 36e5) { await drop(); await edit('Muddati tugadi, qayta yozing.'); return ack(); }
  const opt = p.ask && p.ask.options[Number(idx)];
  if (!opt) return ack();
  const picks = { ...p.picks };
  if (p.ask.field === 'pair') { const [a, b] = opt.value.split('|'); picks.a = a; picks.b = b; } else picks[p.ask.field] = opt.value;
  const res = parse(p.text, await loadCtx(), picks);
  if (res && res.ask) {
    await sb(`/kutish?id=eq.${p.id}`, 'PATCH', { picks, ask: res.ask });
    await edit(res.ask.question, { reply_markup: kb(p.id, res.ask) });
    return ack();
  }
  await drop();
  if (!res || !res.ok) { await edit('❌ ' + ((res && res.error) || 'Tushunmadim, qayta yozing.')); return ack(); }
  await edit('✅ Tanlandi');
  await record(res, { chat: Number(p.chat), mid: Number(p.msg), by: String(p.uid), name: p.uname, key: `${p.chat}:${p.msg}` });
  return ack();
}

exports.handler = async ev => {
  if (ev.httpMethod !== 'POST') {
    // Bir martalik webhook ulash: saytManzili/.netlify/functions/bot?setup=WEBHOOK_SECRET
    const q = ev.queryStringParameters || {};
    if (q.setup && E.WEBHOOK_SECRET && q.setup === E.WEBHOOK_SECRET) {
      try {
        const url = `https://${ev.headers.host}/.netlify/functions/bot`;
        const r = await fetch(`${TG}/setWebhook`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, secret_token: E.WEBHOOK_SECRET, allowed_updates: ['message', 'callback_query'] }),
        });
        return { statusCode: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: await r.text() };
      } catch (e) { return { statusCode: 200, body: 'xato: ' + e.message }; }
    }
    return { statusCode: 200, body: 'ok' };
  }
  if ((ev.headers['x-telegram-bot-api-secret-token'] || '') !== (E.WEBHOOK_SECRET || '\0')) return { statusCode: 401, body: '' };
  let u; try { u = JSON.parse(ev.body); } catch { return { statusCode: 200, body: '' }; }
  try { await handle(u); }
  catch (e) {
    console.error(e);
    const c = u.message && u.message.chat && u.message.chat.id;
    if (c && String(c) === String(E.GROUP_ID)) await say(c, '⚠️ Tizimda xatolik. Yozuv saqlanmadi — birozdan keyin qayta yuboring.', u.message.message_id);
  }
  return { statusCode: 200, body: 'ok' }; // Telegram qayta yubormasligi uchun doim 200
};
exports._t = { norm, parseSum, find, pair, turMash };
