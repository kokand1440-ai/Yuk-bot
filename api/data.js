'use strict';
// Mini-sayt uchun xavfsiz API: Telegram foydalanuvchisini tekshiradi, Supabase bilan gaplashadi.
const crypto = require('crypto');
const E = process.env;
const REST = `${E.SUPABASE_URL}/rest/v1`;
const HDR = { apikey: E.SUPABASE_KEY, Authorization: `Bearer ${E.SUPABASE_KEY}`, 'Content-Type': 'application/json' };

const COLS = {
  mijoz: 'id,ism,hud,tel,t,by,del,del_t,del_by,hist',
  amal: 'id,no,tur,mijoz,kimdan,kimga,tol,yon,veh,sum,sana,izoh,holat,hol_t,hol_by,q_sabab,t,by,by_name,del,del_t,del_by,hist,media',
  xarj: 'id,no,guruh,obj,tur,sum,sana,izoh,t,by,by_name,del,del_t,del_by,hist,media',
  owner_xarj: 'id,no,guruh,obj,tur,sum,sana,izoh,t,by,by_name,del,del_t,del_by,hist,media',
  owner_qarz: 'id,tur,kim,sum,sana,izoh,h,yopilgan,t,by,by_name,del,del_t,del_by,hist,media',
  joy: 'id,veh,lat,lng,acc,t,by',
  qabul: 'id,t,v',
};
const OWNER_ONLY = ['owner_xarj', 'owner_qarz', 'joy'];
const SELF_ONLY = ['joy', 'qabul'];
const snake = k => (k === 'qsabab' ? 'q_sabab' : k.replace(/[A-Z]/g, m => '_' + m.toLowerCase()));
const camel = k => (k === 'q_sabab' ? 'qsabab' : k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()));

function verify(init) {
  if (!init) return null;
  const p = new URLSearchParams(init), hash = p.get('hash');
  p.delete('hash');
  const str = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const key = crypto.createHmac('sha256', 'WebAppData').update(E.BOT_TOKEN).digest();
  const h = crypto.createHmac('sha256', key).update(str).digest('hex');
  if (!hash || h !== hash) return null;
  if (Date.now() / 1000 - Number(p.get('auth_date') || 0) > 3 * 86400) return null;
  try { return JSON.parse(p.get('user')); } catch { return null; }
}
const memb = new Map();
async function isMember(uid) {
  const c = memb.get(uid);
  if (c && Date.now() - c.t < 300000) return c.ok;
  let ok = false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${E.BOT_TOKEN}/getChatMember`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: E.GROUP_ID, user_id: uid }),
    });
    const j = await r.json();
    ok = !!(j.ok && ['creator', 'administrator', 'member', 'restricted'].includes(j.result.status));
  } catch (_) {}
  memb.set(uid, { ok, t: Date.now() });
  return ok;
}
const toDb = (c, v) => {
  const ok = COLS[c].split(','), o = {};
  for (const k of Object.keys(v || {})) { const s = snake(k); if (ok.includes(s) && s !== 'no') o[s] = v[k]; }
  return o;
};
const fromDb = r => { const o = {}; for (const k of Object.keys(r)) if (r[k] !== null) o[camel(k)] = r[k]; return o; };
async function sb(path, init) {
  const r = await fetch(REST + path, { ...init, headers: { ...HDR, ...(init && init.headers) } });
  const txt = await r.text();
  if (!r.ok) throw new Error(`${path.split('?')[0]} ${r.status} ${txt.slice(0, 120)}`);
  return txt ? JSON.parse(txt) : null;
}
async function listAll(c) {
  const out = [];
  for (let i = 0; i < 20; i++) {
    const rows = await sb(`/${c}?select=${COLS[c]}&order=id`, { headers: { Range: `${i * 1000}-${i * 1000 + 999}` } });
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'POST') return res.status(200).send('ok');
    const b = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const u = verify(req.headers['x-tg-init']);
    if (!u) return res.status(401).json({ error: 'Telegram orqali kiring' });
    const uid = String(u.id), owner = uid === String(E.BOSS_ID);
    if (!owner && !(await isMember(u.id))) return res.status(403).json({ error: 'Siz guruh a\'zosi emassiz' });
    const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || uid;
    const c = b.c;
    if (b.op === 'me') return res.status(200).json({ id: uid, owner, name });
    if (b.op === 'profiles') {
      const ids = (b.ids || []).map(String).filter(x => /^\d+$/.test(x)).slice(0, 50), out = {};
      if (ids.length) {
        const rows = await sb(`/amal?select=by,by_name&by=in.(${ids.join(',')})&by_name=not.is.null&limit=500`);
        rows.forEach(r => { out[r.by] = { name: r.by_name }; });
      }
      out[uid] = { name };
      return res.status(200).json(out);
    }
    if (b.op === 'list') {
      const want = (b.cols || []).filter(x => COLS[x] && (owner || !OWNER_ONLY.includes(x)));
      const out = {};
      await Promise.all(want.map(async x => { out[x] = (await listAll(x)).map(fromDb); }));
      return res.status(200).json(out);
    }
    if (!COLS[c]) return res.status(400).json({ error: 'noma\'lum jadval' });
    if (OWNER_ONLY.includes(c) && !owner && !(SELF_ONLY.includes(c) && b.op === 'set' && String(b.id) === uid))
      return res.status(403).json({ error: 'Ruxsat yo\'q' });
    if (SELF_ONLY.includes(c) && b.op === 'set' && String(b.id) !== uid) return res.status(403).json({ error: 'Ruxsat yo\'q' });
    const H = { Prefer: 'return=representation' };
    if (b.op === 'add') {
      const v = toDb(c, b.v);
      if (COLS[c].includes('by_name')) { v.by = uid; v.by_name = name; }
      const r = await sb(`/${c}`, { method: 'POST', headers: H, body: JSON.stringify(v) });
      return res.status(200).json({ id: r[0].id });
    }
    if (b.op === 'update') {
      await sb(`/${c}?id=eq.${encodeURIComponent(b.id)}`, { method: 'PATCH', headers: H, body: JSON.stringify(toDb(c, b.patch)) });
      return res.status(200).json({ ok: true });
    }
    if (b.op === 'set') {
      const v = { ...toDb(c, b.v), id: String(b.id) };
      await sb(`/${c}?on_conflict=id`, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(v) });
      return res.status(200).json({ ok: true });
    }
    if (b.op === 'get') {
      const r = await sb(`/${c}?select=${COLS[c]}&id=eq.${encodeURIComponent(b.id)}`);
      return res.status(200).json(r[0] ? fromDb(r[0]) : null);
    }
    return res.status(400).json({ error: 'noma\'lum amal' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e.message || e).slice(0, 200) });
  }
};
