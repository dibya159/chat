/* Dosto ka Chat - Bots (Telegram jaise commands, bilkul free)
   Chat mein "/" se shuru hone wala message bot command hota hai (jaise /weather Delhi, /ai [sawaal]).
*/
export default function ({ root, bridge, getUser, on }) {
  const $ = id => document.getElementById(id);
  const msgsBox = $('msgs'), input = $('text');
  
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const TS = () => firebase.database.ServerValue.TIMESTAMP;
  const pick = a => a[Math.floor(Math.random() * a.length)];

  // ---------- bot registry ----------
  const registry = new Map();
  function register(bot) {
    if (!bot || !/^[A-Za-z0-9_]{2,20}$/.test(bot.id || '') || !bot.commands) throw new Error('Bot id aur commands chahiye.');
    registry.set(bot.id, bot);
  }
  function find(cmd) { for (const bot of registry.values()) if (bot.commands[cmd]) return { bot, def: bot.commands[cmd] }; return null; }

  // ---------- helpers ----------
  async function getJson(url, ms) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms || 8000);
    try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
    finally { clearTimeout(t); }
  }
  const hasHindi = s => /[\u0900-\u097F]/.test(s);
  function calc(expr) {
    const s = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '').replace(/\s+/g, '');
    if (!s || s.length > 100 || !/^[0-9+\-*/%^().]+$/.test(s)) throw new Error('bad');
    let i = 0;
    const peek = () => s[i], num = () => { const m = /^\d*\.?\d+/.exec(s.slice(i)); if (!m) throw new Error('bad'); i += m[0].length; return parseFloat(m[0]); };
    function primary() { if (peek() === '(') { i++; const v = expr0(); if (peek() !== ')') throw new Error('bad'); i++; return v; } return num(); }
    function unary() { if (peek() === '-') { i++; return -unary(); } if (peek() === '+') { i++; return unary(); } return primary(); }
    function power() { const b = unary(); if (peek() === '^') { i++; return Math.pow(b, power()); } return b; }
    function term() { let v = power(); while ('*/%'.includes(peek() || ' ')) { const o = s[i++]; const r = power(); v = o === '*' ? v * r : o === '/' ? v / r : v % r; } return v; }
    function expr0() { let v = term(); while ('+-'.includes(peek() || ' ')) { const o = s[i++]; const r = term(); v = o === '+' ? v + r : v - r; } return v; }
    const v = expr0(); if (i !== s.length || !isFinite(v)) throw new Error('bad');
    return Math.round(v * 1e8) / 1e8;
  }
  const WMO = c => c === 0 ? '☀️ Saaf aasman' : c <= 2 ? '🌤️ Halke badal' : c === 3 ? '☁️ Badal chhaye' : c <= 48 ? '🌫️ Kohra' : c <= 57 ? '🌦️ Boondabandi' : c <= 67 ? '🌧️ Baarish' : c <= 77 ? '❄️ Barfbari' : c <= 82 ? '🌧️ Tej baarish' : '⛈️ Aandhi-toofan';

  const JOKES = [
    'Teacher: Tumhare ghar mein sabse tez kaun hai?\nStudent: Wi-Fi, sir. Wo bhi kabhi kabhi. 😅',
    'Dost: Exam kaisa gaya?\nMain: Question paper ne mujhe pehchana hi nahi. 😂',
    'Maa: Phone chhodo, padhai karo.\nMain: Maa, ye padhai hi hai... Instagram ka bhi syllabus hota hai. 📱'
  ];

  // ---------- built-in bots ----------
  register({
    id: 'infobot', name: 'InfoBot', icon: '🌐',
    commands: {
      ai: { usage: 'sawaal', help: 'Gemini AI se kuch bhi poochein', usageErr: 'Aise likho: /ai India ka capital kya hai?', run: async q => {
        if (!q.trim()) throw new Error('usage');
        
        const apiKey = "AQ.Ab8RN6IDN1kk-IvGQ9ynX9wQhyM0FIJUC1sXa4pKB5jwuzkKHg";
        const apiURL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + apiKey;

        try {
          const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 15000);
          const r = await fetch(apiURL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: q }] }] }),
            signal: ctl.signal
          });
          clearTimeout(t);
          if (!r.ok) throw new Error('HTTP ' + r.status);
          const data = await r.json();
          
          let reply = "No response from AI.";
          if (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
            reply = data.candidates[0].content.parts[0].text;
          }
          return '🤖 ' + reply;
        } catch (err) {
          return '❌ AI error: ' + err.message;
        }
      } }
    }
  });

  // ---------- state & ui integration ----------
  let me = getUser(), db = null, offset = 0, offs = [], lastRun = 0, syncing = false;
  const replies = new Map(), pending = new Set(), done = new Set();
  const now = () => Date.now() + offset;

  const style = document.createElement('style');
  style.textContent = `
  .bt-row{display:flex;align-items:flex-end;gap:7px;max-width:91%;align-self:flex-start}
  .bt-av{width:27px;height:27px;border-radius:50%;flex:none;background:#1f6b5c;display:grid;place-items:center;font-size:14px}
  .bt{position:relative;padding:8px 11px;border:1px solid #2f7d6d;border-radius:15px 15px 15px 5px;background:#12302b;overflow-wrap:anywhere;white-space:pre-wrap;font-size:14px;line-height:1.45}
  .bt b{display:block;color:#7fe3c8;font-size:11px;margin-bottom:3px}
  .bt .stamp{font-size:9px;color:#9fc9bf;margin-left:7px;white-space:nowrap}`;
  document.head.appendChild(style);

  function botRow(key, r) {
    const bot = registry.get(r && r.bot) || { name: 'Bot', icon: '🤖' };
    const row = document.createElement('div'); row.className = 'bt-row'; row.dataset.for = key;
    const av = document.createElement('div'); av.className = 'bt-av'; av.textContent = bot.icon;
    const bub = document.createElement('div'); bub.className = 'bt';
    const bTag = document.createElement('b'); bTag.textContent = bot.icon + ' ' + bot.name;
    const spanTag = document.createElement('span'); spanTag.textContent = r ? r.text : '⏳ soch raha hoon...';
    bub.append(bTag, spanTag);
    row.append(av, bub); return row;
  }

  function sync() {
    if (!msgsBox || syncing) return; syncing = true;
    const stick = msgsBox.scrollHeight - msgsBox.scrollTop - msgsBox.clientHeight < 150;
    msgsBox.querySelectorAll('.bt-row').forEach(n => n.remove());
    msgsBox.querySelectorAll('.msg-row').forEach(row => {
      const art = row.querySelector('article.msg'), key = art && art.dataset.key; if (!key) return;
      if (replies.has(key)) row.after(botRow(key, replies.get(key)));
      else if (pending.has(key)) row.after(botRow(key, null));
    });
    if (stick) msgsBox.scrollTop = msgsBox.scrollHeight;
    mo.takeRecords(); syncing = false;
  }
  let st = 0; const later = () => { clearTimeout(st); st = setTimeout(sync, 40); };
  const mo = new MutationObserver(() => { if (!syncing) later(); });
  if (msgsBox) mo.observe(msgsBox, { childList: true });

  async function runCommand(key, hit, args) {
    pending.add(key); later();
    let text;
    try {
      const out = await Promise.race([Promise.resolve(hit.def.run(args, { me })), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000))]);
      text = String(out == null ? '' : (out.text || out)).slice(0, 1200) || '🤷 Kuch nahi mila.';
    } catch (e) {
      text = '😕 Error aaya.';
    }
    try { await db.ref('botReplies/' + key).set({ bot: hit.bot.id, text, ts: TS() }); }
    catch (e) { replies.set(key, { bot: hit.bot.id, text, ts: now() }); }
    pending.delete(key); later();
  }

  function onOwnMessage(s) {
    const m = s.val(), key = s.key; if (!m || !me || m.uid !== me.uid || typeof m.text !== 'string' || done.has(key)) return;
    const mm = /^\/([A-Za-z]{2,15})(?:@\w+)?(?:\s+([\s\S]*))?$/.exec(m.text.trim()); if (!mm) return;
    const hit = find(mm[1].toLowerCase()); if (!hit) return;
    done.add(key);
    db.ref('botReplies/' + key).once('value').then(x => {
      if (x.exists()) return;
      runCommand(key, hit, (mm[2] || '').trim());
    }).catch(() => {});
  }

  function start(user) {
    stop();
    if (!user || !window.firebase || !firebase.database) return;
    me = user; db = firebase.database();
    const mref = db.ref('messages').limitToLast(100), rref = db.ref('botReplies').limitToLast(150), oref = db.ref('.info/serverTimeOffset');
    oref.on('value', s => { offset = Number(s.val()) || 0; });
    mref.on('child_added', onOwnMessage);
    rref.on('child_added', s => { const v = s.val(); if (v && v.text) { replies.set(s.key, v); later(); } });
  }

  function stop() { offs.forEach(f => { try { f(); } catch (_) {} }); offs = []; me = null; db = null; replies.clear(); pending.clear(); }

  if (getUser()) start(getUser());
  const offLogin = on('login', u => start(u)), offLogout = on('logout', () => stop());

  return () => {
    offLogin(); offLogout(); stop(); mo.disconnect(); clearTimeout(st);
    style.remove();
  };
}
