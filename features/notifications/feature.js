/* Dosto ka Chat - Notifications (asli database paths ke saath)
   Alerts: group chat (@mention/reply), DM, friend request, game challenge, friends ki story, TBan, (admin ko) reports.
   App khula ho to chhota in-app alert + awaz, band/background ho to phone notification (service worker se).
   NOTE: app poori tarah band ho to koi bhi page-based feature notification nahi bhej sakta - uske liye server (FCM) chahiye. */
export default function ({ root, getUser, on }) {
  if (root) root.style.display = 'none';
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const LS_OFF = 'dosto_notify_off', LS_ASK = 'dosto_notify_ask';
  const ls = { get: k => { try { return localStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} } };
  const TAG = /^\u27E6r:([A-Za-z0-9_-]+)\u27E7/;
  const strip = t => String(t || '').replace(TAG, '').trim();

  let me = null, db = null, offs = [], offset = 0, started = 0, users = {}, friends = {}, chatUnread = 0, storyDot = false, staffOffs = null, pollId = 0, friendOffs = new Map();
  const recent = new Map(), uiOffs = [];
  const listen = (t, ev, fn, o) => { if (!t) return; t.addEventListener(ev, fn, o); uiOffs.push(() => t.removeEventListener(ev, fn, o)); };
  const attach = (ref, ev, cb, bag) => { ref.on(ev, cb, () => {}); (bag || offs).push(() => ref.off(ev, cb)); };
  const now = () => Date.now() + offset;
  const nameOf = uid => (users[uid] && (users[uid].username || users[uid].chatName)) || 'Dost';
  const enabled = () => ls.get(LS_OFF) !== '1';
  const visible = () => document.visibilityState === 'visible';
  const activeTab = () => { const a = document.querySelector('#bottomNav .nav-btn.active'); return a ? a.id : ''; };
  const iconUrl = (() => { try { return new URL('icon/icon-192.png', document.baseURI).href; } catch (_) { return ''; } })();

  // ---------- styles + in-app toast ----------
  const style = el('style');
  style.textContent = `
  .nt-toast{position:fixed;left:50%;top:10px;transform:translate(-50%,-140%);transition:transform .25s;z-index:10060;max-width:92vw;min-width:200px;background:#1a2438;border:1px solid #394866;border-radius:14px;padding:10px 14px;color:#f1f3ff;font-size:13px;box-shadow:0 10px 30px #0008;cursor:pointer}
  .nt-toast.show{transform:translate(-50%,0)}.nt-toast b{display:block;font-size:12px;color:#c2caff;margin-bottom:2px}
  .nt-toast span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .nt-ask{position:fixed;left:50%;bottom:84px;transform:translateX(-50%);z-index:10055;background:#151e30;border:1px solid #394866;border-radius:99px;padding:8px 10px 8px 14px;display:flex;align-items:center;gap:8px;color:#f1f3ff;font-size:12px;box-shadow:0 10px 30px #0008;max-width:94vw}
  .nt-ask button{border:0;border-radius:99px;padding:7px 12px;font-size:12px;font-weight:700;color:#fff;background:#6d75ff;cursor:pointer}.nt-ask button.sec{background:#303b57}
  .nt-pill{position:absolute;top:2px;right:calc(50% - 24px);min-width:16px;height:16px;padding:0 4px;border-radius:99px;background:#ef4444;color:#fff;font:800 10px/16px system-ui,sans-serif;text-align:center;pointer-events:none;display:none}
  .nt-pill.show{display:inline-block}.nt-pill.dot{min-width:9px;width:9px;height:9px;padding:0;right:calc(50% - 20px);top:4px}`;
  document.head.appendChild(style);
  const toastEl = el('div', 'nt-toast'); document.body.appendChild(toastEl); let toastT = 0, toastFn = null;
  listen(toastEl, 'click', () => { toastEl.classList.remove('show'); if (toastFn) toastFn(); });
  function inApp(title, body, fn) {
    toastEl.replaceChildren(el('b', '', title), el('span', '', body)); toastFn = fn || null;
    requestAnimationFrame(() => toastEl.classList.add('show')); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 4500);
  }

  // ---------- sound ----------
  let ac = null;
  const unlock = () => { try { const C = window.AudioContext || window.webkitAudioContext; if (C && !ac) ac = new C(); if (ac && ac.state === 'suspended') ac.resume(); } catch (_) {} };
  listen(document, 'pointerdown', unlock, { once: false, passive: true });
  function chime() {
    try {
      if (!ac || ac.state !== 'running') return;
      const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(587.33, t); o.frequency.setValueAtTime(880, t + 0.08);
      g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.32); o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 0.32);
    } catch (_) {}
  }

  // ---------- system notification (service worker se) ----------
  function system(title, body, tag) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const opts = { body: String(body || '').slice(0, 160), icon: iconUrl, badge: iconUrl, tag: tag || 'dosto', renotify: true, data: { url: location.href } };
    const fallback = () => { try { const n = new Notification(title, opts); n.onclick = () => { window.focus(); n.close(); }; } catch (_) {} };
    if (!navigator.serviceWorker) { fallback(); return; }
    navigator.serviceWorker.getRegistration().then(reg => {
      if (reg && reg.showNotification) return reg.showNotification(title, opts);
      return navigator.serviceWorker.register('./sw.js').then(r => navigator.serviceWorker.ready.then(rr => rr.showNotification(title, opts)));
    }).catch(fallback);
  }
  // onlyHidden: app khula ho to kuch nahi (kyunki app khud dikha raha hai)
  function alertUser({ title, body, tag, onlyHidden, fn }) {
    if (!enabled()) return;
    if (visible()) { if (onlyHidden) return; chime(); inApp(title, body, fn); } else system(title, body, tag);
  }

  // ---------- permission prompt ----------
  function maybeAsk() {
    if (!('Notification' in window) || Notification.permission !== 'default' || !enabled() || document.querySelector('.nt-ask')) return;
    if (Date.now() - Number(ls.get(LS_ASK) || 0) < 3 * 86400000) return;
    const bar = el('div', 'nt-ask'); bar.appendChild(el('span', '', '\uD83D\uDD14 Message alerts chalu karein?'));
    const yes = el('button', '', 'Allow'), no = el('button', 'sec', 'Baad mein'); yes.type = no.type = 'button';
    yes.addEventListener('click', async () => { try { const p = await Notification.requestPermission(); if (p === 'granted') system('Dosto ka Chat', 'Alerts chalu ho gaye \u2705', 'welcome'); } catch (_) {} bar.remove(); });
    no.addEventListener('click', () => { ls.set(LS_ASK, String(Date.now())); bar.remove(); });
    bar.append(yes, no); document.body.appendChild(bar);
  }

  // ---------- tab badges (chat / stories) ----------
  function pill(tabId) {
    const t = $(tabId); if (!t) return null; let p = t.querySelector('.nt-pill');
    if (!p) { p = el('span', 'nt-pill'); t.style.position = 'relative'; t.appendChild(p); } return p;
  }
  function paint() {
    const c = pill('chatTab'); if (c) { c.classList.toggle('show', chatUnread > 0); c.textContent = chatUnread > 99 ? '99+' : String(chatUnread); }
    const s = pill('storiesTab'); if (s) { s.classList.toggle('show', storyDot); s.classList.add('dot'); s.textContent = ''; }
  }
  function clearIfSeen() {
    const a = activeTab(); let ch = false;
    if (visible() && a === 'chatTab' && chatUnread) { chatUnread = 0; ch = true; }
    if (visible() && a === 'storiesTab' && storyDot) { storyDot = false; ch = true; }
    if (ch) paint();
  }
  listen(document, 'visibilitychange', clearIfSeen);
  listen($('bottomNav'), 'click', () => setTimeout(clearIfSeen, 200));

  // ---------- events ----------
  const fresh = (ts, slack) => !Number(ts) || Number(ts) >= started - (slack || 2500);
  function onGroup(s) {
    const m = s.val(); if (!m || typeof m.text !== 'string') return;
    recent.set(s.key, m); if (recent.size > 120) recent.delete(recent.keys().next().value);
    if (!fresh(m.ts) || m.uid === me.uid) return;
    const who = m.user || nameOf(m.uid), text = strip(m.text) || '\uD83D\uDCAC New message';
    const mentioned = new RegExp('(^|[^A-Za-z0-9_])@' + me.username.replace(/[^A-Za-z0-9_]/g, '') + '(?![A-Za-z0-9_])', 'i').test(text);
    const tag = TAG.exec(m.text), replied = tag && recent.get(tag[1]) && recent.get(tag[1]).uid === me.uid;
    const chatView = visible() && activeTab() === 'chatTab';
    if (!chatView) { chatUnread++; paint(); }
    if (mentioned || replied) alertUser({ title: (replied ? '\u21A9 ' : '@ ') + who + (replied ? ' ne reply kiya' : ' ne mention kiya'), body: text, tag: 'mention', fn: () => { const c = $('chatTab'); if (c) c.click(); } });
    else if (!chatView) alertUser({ title: '\uD83D\uDCAC ' + who + ' (Group)', body: text, tag: 'group', fn: () => { const c = $('chatTab'); if (c) c.click(); } });
  }
  function watchDm() {
    let base = null; const last = {};
    attach(db.ref('dmInbox/' + me.uid), 'value', s => {
      const v = s.val() || {};
      Object.keys(v).forEach(peer => {
        const i = v[peer] || {}, ts = Number(i.ts) || 0;
        if (base !== null && i.from && i.from !== me.uid && ts > (last[peer] || 0)) {
          const dmOpen = visible() && document.querySelector('.dm-panel:not([hidden]) .dm-chat:not([hidden])');
          if (!dmOpen) alertUser({ title: '\uD83D\uDCAC ' + nameOf(peer), body: i.text || 'Naya message', tag: 'dm-' + peer, fn: () => { if (window.DostoDM) window.DostoDM.open(peer); } });
        }
        last[peer] = Math.max(last[peer] || 0, ts);
      });
      base = true;
    });
  }
  function watchRequests() {
    let ready = false;
    attach(db.ref('friendRequests/' + me.uid), 'child_added', s => {
      const v = s.val() || {}; if (!ready && !fresh(v.ts, 5000)) return; if (!fresh(v.ts, 5000)) return;
      alertUser({ title: '\uD83D\uDC65 Friend request', body: nameOf(s.key) + ' ne friend request bheji', tag: 'req-' + s.key, onlyHidden: true });
    }); db.ref('friendRequests/' + me.uid).once('value').then(() => { ready = true; }).catch(() => {});
  }
  function watchInvites() {
    attach(db.ref('gameInvites/' + me.uid), 'child_added', s => {
      const v = s.val() || {}; if (!Number(v.ts) || now() - Number(v.ts) > 15000) return;
      alertUser({ title: '\u2694\uFE0F Game challenge', body: nameOf(v.from) + ' ne challenge kiya (' + (v.stake || 0) + ' pts)', tag: 'invite', onlyHidden: true });
    });
  }
  function watchMute() {
    let had = null;
    attach(db.ref('mutes/' + me.uid), 'value', s => {
      const v = s.val(), act = v && Number(v.until) > now();
      if (had === false && act) alertUser({ title: '\u26D4 TBan laga', body: (v.reason || 'Rules todne par') + ' - appeal chat mein se kar sakte ho', tag: 'tban' });
      had = !!act;
    });
  }
  function onStory(uid, s) {
    const v = s.val() || {}; if (!fresh(v.ts, 3000) || uid === me.uid) return;
    storyDot = true; paint();
    alertUser({ title: '\uD83D\uDCF8 Nayi story', body: nameOf(uid) + ' ne story lagayi', tag: 'story-' + uid, fn: () => { const t = $('storiesTab'); if (t) t.click(); } });
  }
  function watchStories() {
    attach(db.ref('friends/' + me.uid), 'value', s => {
      friends = s.val() || {};
      Object.keys(friends).forEach(uid => {
        if (!friends[uid] || friendOffs.has(uid)) return;
        const bag = [];
        ['storiesFriends/', 'storiesAll/'].forEach(p => { const r = db.ref(p + uid).limitToLast(1), cb = x => onStory(uid, x); r.on('child_added', cb, () => {}); bag.push(() => r.off('child_added', cb)); });
        friendOffs.set(uid, () => bag.forEach(f => f()));
      });
    });
  }
  function watchStaff() {
    const staff = !!(window.DostoRoles && window.DostoRoles.isStaff && window.DostoRoles.isStaff());
    if (staff && !staffOffs) {
      staffOffs = [];
      const add = (path, label) => { const r = db.ref(path).limitToLast(1); const cb = s => { const v = s.val() || {}; if (!fresh(v.ts, 2500)) return; alertUser({ title: '\uD83D\uDEA9 Nayi report', body: label + ': ' + (v.text || v.type || ''), tag: 'report', fn: () => { const m = $('menuAdmin'); if (m) m.click(); } }); }; r.on('child_added', cb, () => {}); staffOffs.push(() => r.off('child_added', cb)); };
      add('reports', 'DM/Chat'); add('storyReports', 'Story');
    } else if (!staff && staffOffs) { staffOffs.forEach(f => f()); staffOffs = null; }
  }

  // ---------- session ----------
  function start(user) {
    stop(); if (!user || !window.firebase || !firebase.database) return;
    me = user; db = firebase.database(); started = Date.now();
    attach(db.ref('.info/serverTimeOffset'), 'value', s => { offset = Number(s.val()) || 0; started = Date.now() + offset; });
    attach(db.ref('users'), 'value', s => { users = s.val() || {}; });
    const mref = db.ref('messages').limitToLast(80); attach(mref, 'child_added', onGroup);
    watchDm(); watchRequests(); watchInvites(); watchMute(); watchStories();
    pollId = setInterval(() => { watchStaff(); clearIfSeen(); }, 4000); setTimeout(maybeAsk, 3500);
  }
  function stop() {
    offs.forEach(f => { try { f(); } catch (_) {} }); offs = []; friendOffs.forEach(f => f()); friendOffs.clear();
    if (staffOffs) { staffOffs.forEach(f => f()); staffOffs = null; } clearInterval(pollId);
    me = null; db = null; recent.clear(); chatUnread = 0; storyDot = false; paint();
  }
  window.DostoNotify = Object.freeze({
    test: () => alertUser({ title: '\uD83D\uDD14 Test', body: 'Notification chal raha hai!', tag: 'test' }),
    enable: () => { ls.set(LS_OFF, '0'); try { Notification.requestPermission(); } catch (_) {} },
    mute: flag => ls.set(LS_OFF, flag ? '1' : '0'),
    state: () => ({ permission: window.Notification ? Notification.permission : 'unsupported', muted: !enabled() })
  });
  if (getUser()) start(getUser());
  const offLogin = on('login', u => start(u)), offLogout = on('logout', () => stop());
  return () => {
    offLogin(); offLogout(); stop(); uiOffs.forEach(f => { try { f(); } catch (_) {} }); clearTimeout(toastT);
    [style, toastEl].forEach(n => n.remove()); const a = document.querySelector('.nt-ask'); if (a) a.remove(); document.querySelectorAll('.nt-pill').forEach(n => n.remove()); delete window.DostoNotify;
  };
}
