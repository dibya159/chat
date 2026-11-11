/* Dosto ka Chat - Bots (Telegram jaise commands, bilkul free)
   Chat mein "/" se shuru hone wala message bot command hota hai (jaise /weather Delhi, /ai [sawaal]).
   Jawab bot ke naam se message ke neeche dikhta hai.
*/
export default function ({ root, getUser, on }) {
  const $ = id => document.getElementById(id);
  const msgsBox = $('msgs'), input = $('text');
  if (!msgsBox) throw new Error('Bots: index.html ke elements nahi mile.');
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
    'Maa: Phone chhodo, padhai karo.\nMain: Maa, ye padhai hi hai... Instagram ka bhi syllabus hota hai. 📱',
    'Pappu ne alarm laga ke socha: "Ab to subah 5 baje uth jaunga."\nAlarm: ❌ Pappu: 😴',
    'Dukandaar: Ye shampoo lo, baal kabhi nahi girenge.\nGanje uncle: Tumhare liye bhi kaam karta hai kya? 🤣',
    'Boss: Kal late mat aana.\nMain: Theek hai sir, aaj hi nahi aata. 😎',
    'Doctor: Aapko aaram chahiye.\nMain: Doctor sahab, Monday ko bhi bol do. 🛌',
    'Rickshaw wala: Kahan jaana hai?\nMain: Jahan network ho. 📶'
  ];
  const SHAYARI = [
    'Dosti woh nahi jo roz mile,\ndosti woh hai jo dil mein khile. 💙',
    'Waqt ke saath sab badal jaata hai,\npar sacha dost hamesha yaad aata hai. ✨',
    'Mushkilein aati hain to aane do,\nhumein bhi to sabr aazmana hai. 💪',
    'Chhoti si zindagi hai, hans ke jee lo,\nkal ka kya bharosa, aaj hi kah do. 🌙'
  ];
  const QUOTES = [
    'Chhote kadam bhi manzil tak pahunchate hain. 🚶',
    'Jo ruk gaya wo haar gaya, jo chalta raha wo jeet gaya. 🏁',
    'Seekhna kabhi band mat karo. 📚',
    'Mehnat ka phal der se sahi, par meetha milta hai. 🍯'
  ];

  // ---------- built-in bots ----------
  register({
    id: 'dostobot', name: 'DostoBot', icon: '🤖',
    commands: {
      help: { help: 'Saare commands ki list', run: () => {
        const lines = []; registry.forEach(b => { lines.push(b.icon + ' ' + b.name); Object.keys(b.commands).forEach(c => lines.push('  /' + c + (b.commands[c].usage ? ' ' + b.commands[c].usage : '') + ' — ' + b.commands[c].help)); });
        return lines.join('\n');
      } },
      ping: { help: 'Bot zinda hai ya nahi', run: () => 'pong 🏓' },
      time: { help: 'Abhi ka samay', run: () => '🕒 ' + new Date().toLocaleString([], { dateStyle: 'full', timeStyle: 'short' }) },
      dice: { usage: '[kitne tak]', help: 'Pasa phenko (default 1-6)', run: a => { const n = Math.min(1000, Math.max(2, parseInt(a, 10) || 6)); return '🎲 ' + (1 + Math.floor(Math.random() * n)) + '  (1-' + n + ')'; } },
      coin: { help: 'Sikka uchhalo', run: () => '🪙 ' + pick(['Head', 'Tail']) },
      pick: { usage: 'a, b, c', help: 'Options mein se ek chuno', run: a => { const o = a.split(/[,|]/).map(x => x.trim()).filter(Boolean); if (o.length < 2) throw new Error('usage'); return '👉 ' + pick(o); }, usageErr: 'Aise likho: /pick chai, coffee, juice' },
      calc: { usage: '2+3*4', help: 'Calculator', run: a => '🧮 ' + a + ' = ' + calc(a), usageErr: 'Aise likho: /calc (12+8)*3' },
      joke: { help: 'Ek joke', run: () => '😄 ' + pick(JOKES) },
      shayari: { help: 'Ek shayari', run: () => pick(SHAYARI) },
      quote: { help: 'Ek achhi baat', run: () => '💡 ' + pick(QUOTES) },
      games: { help: 'Games tab kholo', run: () => { if (window.DostoGames) { window.DostoGames.open(); return '🎮 Games tab khol diya!'; } return 'Games abhi available nahi.'; } },
      top: { help: 'Game leaderboard ke top 3', run: () => { const t = window.DostoGames ? window.DostoGames.top(3) : []; if (!t.length) return 'Abhi kisi ne game nahi khela.'; return '🏆 Top players\n' + t.map((r, i) => ['🥇', '🥈', '🥉'][i] + ' ' + r.name + ' — ' + r.points + ' pts').join('\n'); } }
    }
  });

  register({
    id: 'infobot', name: 'InfoBot', icon: '🌐',
    commands: {
      wiki: { usage: 'topic', help: 'Wikipedia se jaankari', usageErr: 'Aise likho: /wiki Taj Mahal', run: async q => {
        const lang = hasHindi(q) ? 'hi' : 'en', base = 'https://' + lang + '.wikipedia.org';
        const s = await getJson(base + '/w/api.php?action=opensearch&limit=1&format=json&origin=*&search=' + encodeURIComponent(q));
        const title = s && s[1] && s[1][0]; if (!title) return '🔍 "' + q + '" ke baare mein kuch nahi mila.';
        const d = await getJson(base + '/api/rest_v1/page/summary/' + encodeURIComponent(title));
        let ex = (d.extract || '').trim(); if (ex.length > 650) ex = ex.slice(0, 650).replace(/\s+\S*$/, '') + '…';
        if (!ex) return '📖 ' + title + '\n' + (d.description || 'Jaankari nahi mili.');
        const url = d.content_urls && d.content_urls.desktop && d.content_urls.desktop.page;
        return '📖 ' + d.title + '\n' + ex + (url ? '\n🔗 ' + url : '');
      } },
      ai: { usage: 'sawaal', help: 'Gemini AI se kuch bhi poochein', usageErr: 'Aise likho: /ai India ka capital kya hai?', run: async q => {
        if (!q.trim()) throw new Error('usage');
        // Yahan Cloudflare Worker ka actual clean URL set hai
        const WORKER_URL = 'https://lucky-sun-3d6a.nhazarika350.workers.dev';
        try {
          const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 15000);
          const r = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: q }),
            signal: ctl.signal
          });
          clearTimeout(t);
          if (!r.ok) throw new Error('HTTP ' + r.status);
          const data = await r.json();
          return '🤖 ' + (data.reply || 'No response from AI.');
        } catch (err) {
          return '❌ AI se connect karne mein error aaya. Worker URL check karein.';
        }
      } },
      weather: { usage: 'sheher', help: 'Mausam', usageErr: 'Aise likho: /weather Delhi', run: async c => {
        const g = await getJson('https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=' + encodeURIComponent(c));
        const p = g.results && g.results[0]; if (!p) return '🔍 "' + c + '" sheher nahi mila.';
        const w = await getJson('https://api.open-meteo.com/v1/forecast?latitude=' + p.latitude + '&longitude=' + p.longitude + '&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=1&timezone=auto');
        const n = w.current || {}, d = w.daily || {};
        return '📍 ' + p.name + (p.country ? ', ' + p.country : '') + '\n' + WMO(n.weather_code) + '  ' + Math.round(n.temperature_2m) + '°C (mehsoos ' + Math.round(n.apparent_temperature) + '°C)\n💧 Nami ' + n.relative_humidity_2m + '%  💨 ' + Math.round(n.wind_speed_10m) + ' km/h' +
          (d.temperature_2m_max ? '\nAaj: ' + Math.round(d.temperature_2m_min[0]) + '° – ' + Math.round(d.temperature_2m_max[0]) + '°C • baarish ka chance ' + (d.precipitation_probability_max[0] || 0) + '%' : '');
      } },
      rate: { usage: '[raqam] usd inr', help: 'Currency rate', usageErr: 'Aise likho: /rate 100 usd inr', run: async a => {
        const m = /^(?:(\d+(?:\.\d+)?)\s+)?([A-Za-z]{3})\s+(?:to\s+)?([A-Za-z]{3})$/.exec(a.trim()); if (!m) throw new Error('usage');
        const amt = parseFloat(m[1] || '1'), from = m[2].toUpperCase(), to = m[3].toUpperCase(); let rate;
        try { const d = await getJson('https://open.er-api.com/v6/latest/' + from); rate = d.rates && d.rates[to]; } catch (_) {}
        if (!rate) { const d = await getJson('https://api.frankfurter.dev/v1/latest?base=' + from + '&symbols=' + to); rate = d.rates && d.rates[to]; }
        if (!rate) return '💱 ' + from + ' → ' + to + ' ka rate nahi mila.';
        return '💱 ' + amt + ' ' + from + ' = ' + (Math.round(amt * rate * 100) / 100) + ' ' + to + '\n(1 ' + from + ' = ' + Math.round(rate * 10000) / 10000 + ' ' + to + ')';
      } },
      dict: { usage: 'word', help: 'English word ka matlab', usageErr: 'Aise likho: /dict happy', run: async w => {
        const d = await getJson('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(w.split(/\s+/)[0]));
        const e = Array.isArray(d) && d[0]; if (!e) return '🔍 "' + w + '" ka matlab nahi mila.';
        return '📚 ' + e.word + (e.phonetic ? '  ' + e.phonetic : '') + '\n' + (e.meanings || []).slice(0, 3).map(m => '• (' + m.partOfSpeech + ') ' + (m.definitions[0] || {}).definition).join('\n');
      } },
      tr: { usage: 'hi hello', help: 'Translate (bhasha code + text)', usageErr: 'Aise likho: /tr hi good morning', run: async a => {
        const m = /^([A-Za-z]{2})\s+([\s\S]+)$/.exec(a.trim()); if (!m) throw new Error('usage');
        const src = hasHindi(m[2]) ? 'hi' : 'en', tgt = m[1].toLowerCase(); if (src === tgt) return m[2];
        const d = await getJson('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(m[2].slice(0, 400)) + '&langpair=' + src + '|' + tgt);
        const t = d.responseData && d.responseData.translatedText; if (!t) return 'Translate nahi ho paya.';
        return '🔤 ' + t;
      } }
    }
  });

  // ---------- state & ui ----------
  let me = null, db = null, offset = 0, offs = [], lastRun = 0, syncing = false;
  const replies = new Map(), pending = new Set(), done = new Set();
  const now = () => Date.now() + offset;

  const style = el('style');
  style.textContent = `
  .bt-row{display:flex;align-items:flex-end;gap:7px;max-width:91%;align-self:flex-start}
  .bt-av{width:27px;height:27px;border-radius:50%;flex:none;background:#1f6b5c;display:grid;place-items:center;font-size:14px}
  .bt{position:relative;padding:8px 11px;border:1px solid #2f7d6d;border-radius:15px 15px 15px 5px;background:#12302b;overflow-wrap:anywhere;white-space:pre-wrap;font-size:14px;line-height:1.45}
  .bt b{display:block;color:#7fe3c8;font-size:11px;margin-bottom:3px}
  .bt .stamp{font-size:9px;color:#9fc9bf;margin-left:7px;white-space:nowrap}
  .bt-sug{display:flex;gap:6px;overflow-x:auto;padding:6px 10px;background:#0f1726;border-top:1px solid #2b3852}
  .bt-sug[hidden]{display:none}.bt-sug button{flex:none;padding:6px 10px;font-size:12px;background:#1a2438;border:1px solid #33435f;border-radius:99px}`;
  document.head.appendChild(style);

  function botRow(key, r) {
    const bot = registry.get(r && r.bot) || { name: 'Bot', icon: '🤖' };
    const row = el('div', 'bt-row'); row.dataset.for = key;
    const av = el('div', 'bt-av', bot.icon), bub = el('div', 'bt');
    bub.appendChild(el('b', '', bot.icon + ' ' + bot.name));
    bub.appendChild(el('span', '', r ? r.text : '⏳ soch raha hoon...'));
    if (r && r.ts) bub.appendChild(el('span', 'stamp', new Date(Number(r.ts)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })));
    row.append(av, bub); return row;
  }
  function sync() {
    if (syncing) return; syncing = true;
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
  const mo = new MutationObserver(recs => { if (syncing) return; if (recs.some(r => [...r.addedNodes, ...r.removedNodes].some(n => !(n.classList && n.classList.contains('bt-row'))))) later(); });
  mo.observe(msgsBox, { childList: true });

  const sug = el('div', 'bt-sug'); sug.hidden = true;
  if (input && input.parentElement) input.parentElement.before(sug);
  function showSug() {
    const v = input ? input.value : ''; sug.replaceChildren();
    const m = /^\/([A-Za-z]*)$/.exec(v); if (!m) { sug.hidden = true; return; }
    const names = []; registry.forEach(b => Object.keys(b.commands).forEach(c => { if (c.startsWith(m[1].toLowerCase())) names.push([c, b.commands[c]]); }));
    names.slice(0, 8).forEach(([c, d]) => { const b = el('button', '', '/' + c + (d.usage ? ' ' + d.usage : '')); b.type = 'button'; b.addEventListener('click', () => { input.value = '/' + c + ' '; input.focus(); showSug(); }); sug.appendChild(b); });
    sug.hidden = !sug.childElementCount;
  }
  const inputListener = () => showSug();
  if (input) { input.addEventListener('input', inputListener); }

  async function runCommand(key, hit, args) {
    pending.add(key); later();
    let text;
    try {
      const out = await Promise.race([Promise.resolve(hit.def.run(args, { me })), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000))]);
      text = String(out == null ? '' : (out.text || out)).slice(0, 1200) || '🤷 Kuch nahi mila.';
    } catch (e) {
      text = e && e.message === 'usage' ? '❓ ' + (hit.def.usageErr || 'Command sahi se likho. /help dekho.') : '😕 Abhi jawab nahi mila. Thodi der baad try karo.';
    }
    try { await db.ref('botReplies/' + key).set({ bot: hit.bot.id, text, ts: TS() }); }
    catch (e) { replies.set(key, { bot: hit.bot.id, text, ts: now() }); }
    pending.delete(key); later();
  }
  function onOwnMessage(s) {
    const m = s.val(), key = s.key; if (!m || !me || m.uid !== me.uid || typeof m.text !== 'string' || done.has(key)) return;
    const mm = /^\/([A-Za-z]{2,15})(?:@\w+)?(?:\s+([\s\S]*))?$/.exec(m.text.trim()); if (!mm) return;
    const hit = find(mm[1].toLowerCase()); if (!hit) return;
    done.add(key); if (done.size > 300) done.delete(done.values().next().value);
    if (now() - (Number(m.ts) || now()) > 60000) return;
    db.ref('botReplies/' + key).once('value').then(x => {
      if (x.exists()) return;
      const t = Date.now();
      if (t - lastRun < 1500) { replies.set(key, { bot: hit.bot.id, text: '⏳ Thoda dheere, ek ke baad ek command bhejo.', ts: now() }); later(); return; }
      lastRun = t; runCommand(key, hit, (mm[2] || '').trim());
    }).catch(() => {});
  }

  function start(user) {
    stop();
    if (!user || !window.firebase || !firebase.database) return;
    me = user; db = firebase.database();
    const mref = db.ref('messages').limitToLast(100), rref = db.ref('botReplies').limitToLast(150), oref = db.ref('.info/serverTimeOffset');
    const ocb = s => { offset = Number(s.val()) || 0; };
    oref.on('value', ocb); offs.push(() => oref.off('value', ocb));
    mref.on('child_added', onOwnMessage, () => {}); offs.push(() => mref.off('child_added', onOwnMessage));
    const radd = s => { const v = s.val(); if (v && v.text) { replies.set(s.key, v); later(); } };
    rref.on('child_added', radd, () => {}); offs.push(() => rref.off('child_added', radd));
    rref.on('child_changed', radd, () => {}); offs.push(() => rref.off('child_changed', radd));
  }
  function stop() { offs.forEach(f => { try { f(); } catch (_) {} }); offs = []; me = null; db = null; replies.clear(); pending.clear(); msgsBox.querySelectorAll('.bt-row').forEach(n => n.remove()); }
  if (getUser()) start(getUser());
  const offLogin = on('login', u => start(u)), offLogout = on('logout', () => stop());

  return () => {
    offLogin(); offLogout(); stop(); mo.disconnect(); clearTimeout(st);
    if (input) input.removeEventListener('input', inputListener);
    [style, sug].forEach(n => n.remove());
  };
           }
       
