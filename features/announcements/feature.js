/* Dosto ka Chat - Announcements
   Header ke neeche banner (latest announcement). Tap -> poori list ki window. Owner/Admin ke liye pencil se naya announcement. */
export default function ({ root, getUser, on }) {
  const OWNER_UID = 'TkdZFaOuM8huIE3I5l6TSWHfHnY2';
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const btn = (label, fn, cls) => { const b = el('button', cls || '', label); b.type = 'button'; b.addEventListener('click', fn); return b; };
  const TS = () => firebase.database.ServerValue.TIMESTAMP;
  const fbErr = e => (e && (e.code === 'PERMISSION_DENIED' || /permission/i.test(e.message || ''))) ? 'Permission nahi mili (Firebase rules update karo).' : ((e && e.message) || 'Error aaya.');
  const lsGet = k => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
  const MAX = 500;

  let me = null, db = null, items = [], isAdmin = false, offs = [], offset = 0, composing = false, toastT = 0;
  const uiOffs = [];
  const isOwner = () => !!(me && (me.isAdmin || me.uid === OWNER_UID));
  const canPost = () => isOwner() || isAdmin;
  const seenKey = () => 'dosto_ann_seen_' + (me ? me.uid : '');
  const fmt = ts => { const d = new Date(Number(ts) || 0); return (d.toDateString() === new Date().toDateString() ? '' : d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' ') + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };

  // ---------- styles ----------
  const style = el('style');
  style.textContent = `
  #featureHost{gap:0!important}
  .an-banner{display:flex;align-items:center;gap:9px;width:100%;margin:0;padding:9px 14px;background:linear-gradient(90deg,#2b2f6b,#3b2a63);border:0;border-bottom:1px solid #4a4f9a;border-radius:0;color:#f1f3ff;font-size:13px;text-align:left;cursor:pointer;box-shadow:none}
  .an-banner[hidden]{display:none}.an-ic{font-size:17px;flex:none}
  .an-txt{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.an-txt b{color:#ffd479;margin-right:6px}
  .an-dot{flex:none;width:9px;height:9px;border-radius:50%;background:#ff5d73;box-shadow:0 0 8px #ff5d73;animation:anp 1.3s infinite}
  @keyframes anp{0%,100%{opacity:1}50%{opacity:.35}}.an-go{flex:none;opacity:.7}
  .an-ov{position:fixed;inset:0;z-index:44;background:#050812e6;display:flex;align-items:center;justify-content:center;padding:10px}.an-ov[hidden]{display:none}
  .an-card{width:min(560px,100%);max-height:90dvh;display:flex;flex-direction:column;background:#151e30;border:1px solid #394866;border-radius:19px;padding:14px;color:#f1f3ff;box-shadow:0 20px 70px #0009}
  .an-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}.an-head h2{flex:1;margin:0;font-size:17px}
  .an-head button{padding:7px 12px;font-size:13px}.an-body{overflow-y:auto;min-height:100px}
  .an-item{padding:10px 12px;margin-top:8px;border-radius:13px;background:#1b263b;border-left:3px solid #6d75ff}
  .an-meta{display:flex;align-items:center;gap:6px;font-size:11px;color:#9ba9c5;margin-bottom:5px}.an-meta b{color:#c2caff;font-size:12px}
  .an-badge{padding:0 6px;border-radius:99px;font-size:9px;font-weight:900;color:#fff}.an-badge.owner{background:linear-gradient(135deg,#f0a93c,#ff6b81)}.an-badge.admin{background:#3e7bff}
  .an-msg{font-size:14px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}.an-msg a{color:#8fb0ff}
  .an-del{margin-left:auto;background:transparent;border:0;color:#ff9aa5;padding:2px 6px;font-size:13px}
  .an-empty{padding:26px 10px;text-align:center;color:#9ba9c5;font-size:13px}
  .an-compose{margin-top:8px;padding:10px;border-radius:13px;background:#101a2c;border:1px solid #33435f}
  .an-compose textarea{width:100%;box-sizing:border-box;min-height:90px;background:#0c1424;color:#fff;border:1px solid #33435f;border-radius:10px;padding:10px;font:inherit;resize:vertical}
  .an-row{display:flex;align-items:center;gap:8px;margin-top:8px}.an-row small{flex:1;color:#9ba9c5}.an-row .sec{background:#303b57}
  .an-toast{position:fixed;left:50%;bottom:80px;transform:translateX(-50%);background:#222c45;color:#fff;padding:9px 14px;border-radius:12px;font-size:13px;z-index:10050;display:none;max-width:90vw}.an-toast.show{display:block}`;
  document.head.appendChild(style);

  const banner = el('button', 'an-banner'); banner.type = 'button'; banner.hidden = true; root.appendChild(banner);
  const ov = el('div', 'an-ov'); ov.hidden = true; document.body.appendChild(ov);
  const toastEl = el('div', 'an-toast'); document.body.appendChild(toastEl);
  const toast = t => { toastEl.textContent = t; toastEl.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 3500); };

  // ---------- banner ----------
  function unseen() { const last = items.length ? Number(items[items.length - 1].ts) || 0 : 0; return last > Number(lsGet(seenKey()) || 0); }
  function paintBanner() {
    banner.replaceChildren();
    if (!me) { banner.hidden = true; return; }
    const last = items[items.length - 1];
    if (!last && !canPost()) { banner.hidden = true; return; }
    banner.hidden = false;
    banner.appendChild(el('span', 'an-ic', '\uD83D\uDCE2'));
    const t = el('span', 'an-txt');
    if (last) { t.appendChild(el('b', '', 'Announcement')); t.appendChild(document.createTextNode(String(last.text).replace(/\s+/g, ' '))); }
    else t.textContent = 'Koi announcement nahi - pencil se naya daalo';
    banner.appendChild(t);
    if (unseen()) banner.appendChild(el('span', 'an-dot'));
    banner.appendChild(el('span', 'an-go', '\u203A'));
  }
  banner.addEventListener('click', openWindow);

  // ---------- window ----------
  function linkify(text) {
    const box = el('div', 'an-msg'); const re = /(https?:\/\/[^\s<]+)/g; let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) box.appendChild(document.createTextNode(text.slice(last, m.index)));
      const a = el('a', '', m[1]); a.href = m[1]; a.target = '_blank'; a.rel = 'noopener noreferrer'; box.appendChild(a); last = m.index + m[1].length;
    }
    if (last < text.length) box.appendChild(document.createTextNode(text.slice(last))); return box;
  }
  function render() {
    if (ov.hidden) return;
    const card = el('div', 'an-card'), head = el('div', 'an-head');
    head.appendChild(el('h2', '', '\uD83D\uDCE2 Announcements'));
    if (canPost()) head.appendChild(btn('\u270F\uFE0F', () => { composing = !composing; render(); }, ''));
    head.appendChild(btn('Close', () => { ov.hidden = true; }, 'sec'));
    card.appendChild(head);
    const body = el('div', 'an-body');
    if (composing && canPost()) {
      const box = el('div', 'an-compose'), ta = el('textarea'), cnt = el('small', '', '0/' + MAX);
      ta.maxLength = MAX; ta.placeholder = 'Announcement likho (sabko dikhega)...'; ta.addEventListener('input', () => { cnt.textContent = ta.value.length + '/' + MAX; });
      const row = el('div', 'an-row'); row.append(cnt, btn('Cancel', () => { composing = false; render(); }, 'sec'), btn('Post karo', () => post(ta.value), ''));
      box.append(ta, row); body.appendChild(box); setTimeout(() => ta.focus(), 50);
    }
    if (!items.length) body.appendChild(el('div', 'an-empty', 'Abhi koi announcement nahi hai.'));
    items.slice().reverse().forEach(a => {
      const it = el('div', 'an-item'), meta = el('div', 'an-meta');
      meta.appendChild(el('b', '', a.byName || 'Admin'));
      if (a.role === 'owner' || a.role === 'admin') meta.appendChild(el('span', 'an-badge ' + a.role, a.role === 'owner' ? 'OWNER' : 'ADMIN'));
      meta.appendChild(el('span', '', fmt(a.ts)));
      if (isOwner() || (isAdmin && a.by === me.uid)) { const d = el('button', 'an-del', '\uD83D\uDDD1'); d.type = 'button'; d.addEventListener('click', () => { if (confirm('Ye announcement delete karein?')) remove(a.id); }); meta.appendChild(d); }
      it.append(meta, linkify(String(a.text))); body.appendChild(it);
    });
    card.appendChild(body); ov.replaceChildren(card);
  }
  function openWindow() {
    if (!me) return; ov.hidden = false; composing = false; render();
    if (items.length) { lsSet(seenKey(), String(items[items.length - 1].ts || Date.now())); paintBanner(); }
  }
  ov.addEventListener('click', e => { if (e.target === ov) ov.hidden = true; });

  // ---------- actions ----------
  async function post(raw) {
    const text = String(raw || '').trim();
    if (text.length < 2) { toast('Kuch likho.'); return; }
    try {
      await db.ref('announcements').push().set({ text: text.slice(0, MAX), by: me.uid, byName: me.username, role: isOwner() ? 'owner' : 'admin', ts: TS() });
      composing = false; toast('Announcement post ho gaya \u2705'); render();
    } catch (e) { toast(fbErr(e)); }
  }
  async function remove(id) { try { await db.ref('announcements/' + id).remove(); toast('Delete ho gaya.'); } catch (e) { toast(fbErr(e)); } }

  // ---------- session ----------
  function start(user) {
    stop(); if (!user || !window.firebase || !firebase.database) return;
    me = user; db = firebase.database();
    const watch = (ref, cb) => { ref.on('value', cb, () => {}); offs.push(() => ref.off('value', cb)); };
    watch(db.ref('roles/' + me.uid), s => { isAdmin = s.val() === 'admin'; paintBanner(); render(); });
    watch(db.ref('announcements').limitToLast(30), s => {
      const v = s.val() || {}; items = Object.keys(v).map(id => ({ id, ...v[id] })).filter(a => a && typeof a.text === 'string').sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0));
      if (!ov.hidden && items.length) lsSet(seenKey(), String(items[items.length - 1].ts || Date.now()));
      paintBanner(); render();
    });
    paintBanner();
  }
  function stop() { offs.forEach(f => { try { f(); } catch (_) {} }); offs = []; me = null; db = null; items = []; isAdmin = false; ov.hidden = true; banner.hidden = true; banner.replaceChildren(); }
  if (getUser()) start(getUser());
  const offLogin = on('login', u => start(u)), offLogout = on('logout', () => stop());
  return () => { offLogin(); offLogout(); stop(); clearTimeout(toastT); [style, banner, ov, toastEl].forEach(n => n.remove()); };
}
