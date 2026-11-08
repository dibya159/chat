/* Dosto ka Chat - DM (private chat, sirf friends)
   Tab, friends list, WhatsApp jaisa navigation (back button), live typing, online/last seen,
   sent/seen ticks, delete for me / delete for everyone. index.html ko chhedna nahi padta. */
export default function ({ root, getUser, on }) {
  const $ = id => document.getElementById(id);
  const app = $('app'), nav = $('bottomNav');
  if (!app || !nav) throw new Error('DM: index.html ke elements nahi mile.');
  const MAX = 1000;
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const safeImg = s => typeof s === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(s) ? s : '';
  const fbErr = e => (e && (e.code === 'PERMISSION_DENIED' || /permission/i.test(e.message || ''))) ? 'Permission denied: Firebase rules mein DM wale blocks add karo.' : ((e && e.message) || 'Error aaya.');
  const TS = () => firebase.database.ServerValue.TIMESTAMP;
  const chatId = (a, b) => [a, b].sort().join('_');
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  const hm = ts => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dayLabel = ts => { const d = new Date(ts), n = new Date(); return sameDay(d, n) ? hm(ts) : sameDay(d, new Date(n - 864e5)) ? 'Kal' : d.toLocaleDateString([], { day: 'numeric', month: 'short' }); };
  const seenText = ts => { if (!ts) return 'offline'; const d = new Date(ts), n = new Date(); return 'last seen ' + (sameDay(d, n) ? 'aaj ' + hm(ts) : sameDay(d, new Date(n - 864e5)) ? 'kal ' + hm(ts) : d.toLocaleDateString([], { day: 'numeric', month: 'short' })); };

  // ---------- state ----------
  let me = null, db = null, users = {}, friends = {}, inbox = {}, offset = 0;
  let peer = null, msgs = [], hidden = {}, peerSeen = 0, peerTyping = 0, peerOnline = false, peerLast = 0, mySeen = 0;
  let offs = [], chatOffs = [], tick = 0, idleT = 0, lastTyp = 0, typActive = false, toastT = 0, pushed = false;
  const uiOffs = [];
  const listen = (t, ev, fn) => { t.addEventListener(ev, fn); uiOffs.push(() => t.removeEventListener(ev, fn)); };
  const attach = (ref, ev, cb, bag) => { ref.on(ev, cb, () => {}); (bag || offs).push(() => ref.off(ev, cb)); };
  const nameOf = uid => (users[uid] && (users[uid].chatName || users[uid].username)) || 'Member';

  // ---------- styles + UI ----------
  const style = el('style');
  style.textContent = `
  .dm-panel{position:absolute;left:0;right:0;top:0;z-index:16;background:#0c1220;display:flex;flex-direction:column;color:#f1f3ff}
  .dm-panel[hidden],.dm-list[hidden],.dm-chat[hidden],.dm-sheet[hidden],.dm-typing[hidden]{display:none}
  .dm-list,.dm-chat{flex:1;min-height:0;display:flex;flex-direction:column}
  .dm-title{font-size:19px;font-weight:800;padding:16px 14px 10px}
  .dm-rows{flex:1;overflow-y:auto}
  .dm-row{display:flex;gap:11px;align-items:center;padding:10px 14px;border-bottom:1px solid #1d2840;cursor:pointer}
  .dm-row:active{background:#1a2438}
  .dm-av{flex:none;border-radius:50%;background:linear-gradient(135deg,#6d75ff,#9b6cff);color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;overflow:hidden}
  .dm-av img{width:100%;height:100%;object-fit:cover}
  .dm-mid{flex:1;min-width:0}.dm-nm{font-weight:700;font-size:15px}
  .dm-pv{font-size:13px;color:#9ba9c5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .dm-side{flex:none;text-align:right;font-size:11px;color:#9ba9c5;display:flex;flex-direction:column;gap:4px;align-items:flex-end}
  .dm-badge{background:#55d9a0;color:#05261a;border-radius:10px;min-width:19px;padding:1px 6px;font-weight:800;font-size:11px;text-align:center}
  .dm-empty{padding:30px 20px;text-align:center;color:#9ba9c5;font-size:14px}
  .dm-head{display:flex;align-items:center;gap:10px;padding:9px 10px;background:#141b2b;border-bottom:1px solid #2b3852}
  .dm-back{background:transparent;padding:6px 10px;font-size:20px;border-radius:10px}
  .dm-hn{font-weight:700}.dm-hs{font-size:12px;color:#9ba9c5}.dm-hs.on{color:#55d9a0}
  .dm-msgs{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:5px}
  .dm-b{max-width:80%;padding:7px 10px 5px;border-radius:14px;font-size:15px;overflow-wrap:anywhere;white-space:pre-wrap;cursor:pointer}
  .dm-b.me{align-self:flex-end;background:#3b4590;border-bottom-right-radius:4px}
  .dm-b.th{align-self:flex-start;background:#1f2b45;border-bottom-left-radius:4px}
  .dm-b.del{font-style:italic;opacity:.65}
  .dm-meta{font-size:10px;color:#c5cdf0b0;text-align:right;margin-top:2px;white-space:nowrap}
  .dm-tk.seen{color:#6fd3ff;font-weight:800}
  .dm-typing{padding:0 14px 6px;display:flex;gap:4px;align-items:center;font-size:12px;color:#9ba9c5}
  .dm-dot{width:6px;height:6px;border-radius:50%;background:#9ba9c5;animation:dmb 1s infinite}
  .dm-dot:nth-child(2){animation-delay:.15s}.dm-dot:nth-child(3){animation-delay:.3s}
  @keyframes dmb{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}
  .dm-bar{display:flex;gap:8px;padding:8px 10px;background:#141b2b;border-top:1px solid #2b3852}
  .dm-sheet{position:absolute;inset:0;z-index:3;background:#0009;display:flex;align-items:flex-end;justify-content:center}
  .dm-sheet>div{width:100%;max-width:420px;background:#141b2b;border-radius:18px 18px 0 0;padding:12px;display:flex;flex-direction:column;gap:8px}
  .dm-sheet button.sec{background:#26324d}.dm-sheet button.dng{background:#c94a63}
  .dm-bdg{position:absolute;top:2px;right:calc(50% - 22px);background:#f0788d;color:#fff;border-radius:9px;font-size:10px;font-weight:800;padding:0 5px;min-width:16px;text-align:center}
  #dmTab{position:relative}
  .dm-toast{position:fixed;left:50%;bottom:80px;transform:translateX(-50%);background:#222c45;color:#fff;padding:9px 14px;border-radius:12px;font-size:13px;z-index:10050;display:none;max-width:90vw}
  .dm-toast.show{display:block}`;
  document.head.appendChild(style);

  const tab = el('button', 'nav-btn'); tab.type = 'button'; tab.id = 'dmTab';
  const tabBadge = el('span', 'dm-bdg'); tabBadge.hidden = true;
  tab.append(el('strong', '', '✉️'), 'DM', tabBadge);
  nav.appendChild(tab);
  nav.style.gridTemplateColumns = 'none'; nav.style.gridAutoFlow = 'column'; nav.style.gridAutoColumns = '1fr';

  const panel = el('section', 'dm-panel'); panel.hidden = true; app.appendChild(panel);
  const listView = el('div', 'dm-list'), rows = el('div', 'dm-rows');
  listView.append(el('div', 'dm-title', '✉️ Private Messages'), rows);
  const chatView = el('div', 'dm-chat'); chatView.hidden = true;
  const back = el('button', 'dm-back', '←'); back.type = 'button';
  let headAv = el('div'); const hName = el('div', 'dm-hn'), hStat = el('div', 'dm-hs');
  const hMid = el('div'); hMid.append(hName, hStat);
  const head = el('div', 'dm-head'); head.append(back, headAv, hMid);
  const msgsEl = el('div', 'dm-msgs');
  const typEl = el('div', 'dm-typing'); typEl.hidden = true;
  typEl.append(el('span', 'dm-dot'), el('span', 'dm-dot'), el('span', 'dm-dot'));
  const inp = el('input'); inp.maxLength = MAX; inp.placeholder = 'Message likho...'; inp.autocomplete = 'off';
  const sendBtn = el('button', '', 'Send'); sendBtn.type = 'button';
  const bar = el('div', 'dm-bar'); bar.append(inp, sendBtn);
  chatView.append(head, msgsEl, typEl, bar);
  const sheet = el('div', 'dm-sheet'); sheet.hidden = true;
  panel.append(listView, chatView, sheet);
  const toastEl = el('div', 'dm-toast'); document.body.appendChild(toastEl);
  const toast = t => { toastEl.textContent = t; toastEl.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 3500); };

  function avatar(uid, size) {
    const a = el('div', 'dm-av'); a.style.width = a.style.height = size + 'px'; a.style.fontSize = Math.round(size * 0.42) + 'px';
    const src = safeImg(users[uid] && users[uid].avatar);
    if (src) { const i = document.createElement('img'); i.src = src; i.alt = ''; a.appendChild(i); } else a.textContent = nameOf(uid).slice(0, 1).toUpperCase();
    return a;
  }

  // ---------- friends list ----------
  function renderList() {
    if (!me) return;
    rows.replaceChildren();
    const ids = Object.keys(friends).filter(u => friends[u] && u !== me.uid);
    ids.sort((a, b) => ((inbox[b] && inbox[b].ts) || 0) - ((inbox[a] && inbox[a].ts) || 0) || nameOf(a).localeCompare(nameOf(b)));
    if (!ids.length) rows.appendChild(el('div', 'dm-empty', 'Abhi koi friend nahi. Pehle kisi ko friend request bhejo, phir yahan private message kar sakte ho.'));
    let total = 0;
    ids.forEach(uid => {
      const i = inbox[uid] || {}, un = Number(i.unread) || 0; total += un;
      const row = el('div', 'dm-row'), mid = el('div', 'dm-mid'), side = el('div', 'dm-side');
      mid.append(el('div', 'dm-nm', nameOf(uid)), el('div', 'dm-pv', i.text ? (i.from === me.uid ? 'You: ' : '') + i.text : 'Tap karke message bhejo'));
      side.appendChild(el('span', '', i.ts ? dayLabel(i.ts) : ''));
      if (un) side.appendChild(el('span', 'dm-badge', un > 99 ? '99+' : String(un)));
      row.append(avatar(uid, 44), mid, side);
      row.addEventListener('click', () => openChat(uid));
      rows.appendChild(row);
    });
    tabBadge.hidden = !total; tabBadge.textContent = total > 99 ? '99+' : String(total);
  }

  // ---------- chat view ----------
  function refreshHead() {
    if (!peer) return;
    const typing = peerTyping && (Date.now() + offset - peerTyping) < 7000;
    hStat.className = 'dm-hs' + (typing || peerOnline ? ' on' : '');
    hStat.textContent = typing ? 'typing...' : peerOnline ? 'online' : seenText(peerLast);
    typEl.hidden = !typing;
    if (typing) msgsEl.scrollTop = msgsEl.scrollHeight;
  }
  function renderHead() {
    hName.textContent = nameOf(peer);
    headAv.replaceWith(headAv = avatar(peer, 38));
    refreshHead();
  }
  function renderMsgs() {
    if (!peer) return;
    const stick = msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 120;
    msgsEl.replaceChildren();
    msgs.forEach(m => {
      if (hidden[m.id]) return;
      const mine = m.from === me.uid, b = el('div', 'dm-b ' + (mine ? 'me' : 'th') + (m.del ? ' del' : ''));
      b.appendChild(el('div', '', m.del ? '🚫 Ye message delete ho gaya' : String(m.text || '')));
      const meta = el('div', 'dm-meta', m.ts ? hm(m.ts) : '');
      if (mine && !m.del) { const seen = peerSeen >= (m.ts || 0) && m.ts; const tk = el('span', 'dm-tk' + (seen ? ' seen' : ''), seen ? ' ✓✓' : ' ✓'); meta.appendChild(tk); }
      b.appendChild(meta);
      b.addEventListener('click', () => openSheet(m));
      msgsEl.appendChild(b);
    });
    if (stick) msgsEl.scrollTop = msgsEl.scrollHeight;
  }
  function markSeen() {
    if (!peer || !me || document.visibilityState !== 'visible' || panel.hidden) return;
    const last = msgs.reduce((x, m) => m.from === peer ? Math.max(x, Number(m.ts) || 0) : x, 0);
    if (last > mySeen) {
      mySeen = last;
      db.ref('dmSeen/' + chatId(me.uid, peer) + '/' + me.uid).set(TS()).catch(() => {});
    }
    if (inbox[peer] && inbox[peer].unread) db.ref('dmInbox/' + me.uid + '/' + peer + '/unread').set(0).catch(() => {});
  }
  function openChat(uid) {
    if (!me) return;
    if (!friends[uid]) { toast('Sirf friends ko message kar sakte ho.'); return; }
    closeChat();
    peer = uid; msgs = []; hidden = {}; peerSeen = 0; peerTyping = 0; peerOnline = false; peerLast = 0; mySeen = 0;
    const id = chatId(me.uid, uid);
    listView.hidden = true; chatView.hidden = false; renderHead(); renderMsgs();
    attach(db.ref('dmChats/' + id + '/messages').limitToLast(150), 'value', s => {
      msgs = []; s.forEach(c => { const v = c.val(); if (v && v.from) msgs.push({ id: c.key, ...v }); });
      renderMsgs(); markSeen();
    }, chatOffs);
    attach(db.ref('dmSeen/' + id + '/' + uid), 'value', s => { peerSeen = Number(s.val()) || 0; renderMsgs(); }, chatOffs);
    attach(db.ref('dmTyping/' + id + '/' + uid), 'value', s => { const v = s.val(); peerTyping = v ? (Number(v.t) || Date.now() + offset) : 0; refreshHead(); }, chatOffs);
    attach(db.ref('online/' + uid), 'value', s => { peerOnline = s.exists(); refreshHead(); }, chatOffs);
    attach(db.ref('lastSeen/' + uid), 'value', s => { peerLast = Number(s.val()) || 0; refreshHead(); }, chatOffs);
    attach(db.ref('dmHide/' + me.uid + '/' + id), 'value', s => { hidden = s.val() || {}; renderMsgs(); }, chatOffs);
    try { db.ref('dmTyping/' + id + '/' + me.uid).onDisconnect().remove(); } catch (_) {}
    try { history.pushState({ dm: uid }, ''); pushed = true; } catch (_) {}
    setTimeout(() => { msgsEl.scrollTop = msgsEl.scrollHeight; }, 50);
  }
  function closeChat() {
    if (!peer) return;
    setTyping(false);
    chatOffs.forEach(f => { try { f(); } catch (_) {} }); chatOffs = [];
    peer = null; sheet.hidden = true; typEl.hidden = true;
    chatView.hidden = true; listView.hidden = false; renderList();
  }
  listen(back, 'click', () => { if (pushed) { pushed = false; try { history.back(); return; } catch (_) {} } closeChat(); });
  listen(window, 'popstate', () => { pushed = false; if (peer) closeChat(); });
  listen(document, 'visibilitychange', () => {
    if (document.visibilityState === 'visible') markSeen();
    else if (me && db) db.ref('lastSeen/' + me.uid).set(TS()).catch(() => {});
  });

  // ---------- send / typing ----------
  function setTyping(flag) {
    if (!me || !peer || !db) return;
    const r = db.ref('dmTyping/' + chatId(me.uid, peer) + '/' + me.uid);
    if (flag) {
      const n = Date.now();
      if (n - lastTyp > 2500) { lastTyp = n; r.set({ t: TS() }).catch(() => {}); }
      clearTimeout(idleT); idleT = setTimeout(() => setTyping(false), 4000); typActive = true;
    } else {
      clearTimeout(idleT);
      if (typActive) { typActive = false; lastTyp = 0; r.remove().catch(() => {}); }
    }
  }
  listen(inp, 'input', () => setTyping(inp.value.length > 0));
  async function send() {
    const text = inp.value.trim().slice(0, MAX);
    if (!text || !peer || !me) return;
    if (!friends[peer]) { toast('Ab aap friends nahi ho.'); return; }
    inp.value = ''; setTyping(false);
    const id = chatId(me.uid, peer), key = db.ref('dmChats/' + id + '/messages').push().key, upd = {};
    upd['dmChats/' + id + '/messages/' + key] = { from: me.uid, text, ts: TS() };
    [[me.uid, peer], [peer, me.uid]].forEach(([o, p]) => {
      const b = 'dmInbox/' + o + '/' + p + '/';
      upd[b + 'text'] = text.slice(0, 80); upd[b + 'ts'] = TS(); upd[b + 'from'] = me.uid;
    });
    try {
      await db.ref().update(upd);
      db.ref('dmInbox/' + peer + '/' + me.uid + '/unread').transaction(n => (Number(n) || 0) + 1).catch(() => {});
    } catch (e) { toast(fbErr(e)); inp.value = text; }
  }
  listen(sendBtn, 'click', send);
  listen(inp, 'keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); send(); } });

  // ---------- delete ----------
  function openSheet(m) {
    sheet.replaceChildren();
    const box = el('div'), id = chatId(me.uid, peer), mk = (label, cls, fn) => { const b = el('button', cls, label); b.type = 'button'; b.addEventListener('click', () => { sheet.hidden = true; fn(); }); box.appendChild(b); };
    mk('🗑️ Delete for me', '', () => db.ref('dmHide/' + me.uid + '/' + id + '/' + m.id).set(true).catch(e => toast(fbErr(e))));
    if (m.from === me.uid && !m.del) mk('🚫 Delete for everyone', 'dng', async () => {
      try {
        await db.ref('dmChats/' + id + '/messages/' + m.id).set({ from: me.uid, ts: m.ts, del: true });
        const upd = {};
        if (inbox[peer] && inbox[peer].ts === m.ts) { upd['dmInbox/' + me.uid + '/' + peer + '/text'] = '🚫 Message deleted'; upd['dmInbox/' + peer + '/' + me.uid + '/text'] = '🚫 Message deleted'; await db.ref().update(upd); }
      } catch (e) { toast(fbErr(e)); }
    });
    mk('Cancel', 'sec', () => {});
    sheet.appendChild(box); sheet.hidden = false;
  }
  listen(sheet, 'click', e => { if (e.target === sheet) sheet.hidden = true; });

  // ---------- tab ----------
  function openPanel() {
    if (!me) return;
    const lb = document.querySelector('.lb-wrap.open'); if (lb) lb.classList.remove('open');
    document.querySelectorAll('.pf-panel,.st-panel').forEach(p => { p.hidden = true; });
    panel.style.bottom = nav.offsetHeight + 'px'; panel.hidden = false;
    nav.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b === tab));
    renderList(); markSeen();
  }
  function closePanel() { closeChat(); panel.hidden = true; tab.classList.remove('active'); }
  listen(tab, 'click', () => { if (panel.hidden) openPanel(); else { const ct = $('chatTab'); if (ct) ct.click(); } });
  listen(nav, 'click', e => { const b = e.target.closest('.nav-btn'); if (b && b !== tab && !panel.hidden) closePanel(); });
  window.DostoDM = Object.freeze({ open: uid => { openPanel(); openChat(uid); } });

  // ---------- session ----------
  function start(user) {
    stop();
    if (!user || !window.firebase || !firebase.database) return;
    me = user; db = firebase.database();
    attach(db.ref('.info/serverTimeOffset'), 'value', s => { offset = Number(s.val()) || 0; });
    attach(db.ref('users'), 'value', s => { users = s.val() || {}; renderList(); if (peer) renderHead(); });
    attach(db.ref('friends/' + me.uid), 'value', s => { friends = s.val() || {}; if (peer && !friends[peer]) { closeChat(); toast('Ab aap friends nahi ho.'); } renderList(); });
    attach(db.ref('dmInbox/' + me.uid), 'value', s => { inbox = s.val() || {}; renderList(); });
    try { db.ref('lastSeen/' + me.uid).onDisconnect().set(TS()); } catch (_) {}
    tick = setInterval(refreshHead, 2000);
  }
  function stop() {
    closePanel();
    offs.forEach(f => { try { f(); } catch (_) {} }); offs = [];
    clearInterval(tick);
    me = null; db = null; users = {}; friends = {}; inbox = {};
    rows.replaceChildren(); tabBadge.hidden = true;
  }
  if (getUser()) start(getUser());
  const offLogin = on('login', u => start(u));
  const offLogout = on('logout', () => stop());

  return () => {
    offLogin(); offLogout(); stop();
    uiOffs.forEach(f => { try { f(); } catch (_) {} });
    [style, tab, panel, toastEl].forEach(n => n.remove());
    delete window.DostoDM;
  };
}
