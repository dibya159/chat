/* Dosto ka Chat - Profile Hub
   Profile tab, profile visit card, friend requests, notification bell, @mentions.
   Sirf features.json se load hota hai, index.html edit karne ki zarurat nahi. */
export default function ({ root, getUser, on }) {
  // ---------- settings (yahan se edit kar sakte ho) ----------
  const TIERS = [[0, 'Bronze', '🥉'], [25, 'Silver', '🥈'], [100, 'Gold', '🥇'], [250, 'Platinum', '💠'], [500, 'Diamond', '💎']];
  const BG_KEY = 'dosto_chat_background_v1'; // index.html wali key hi hai

  const $ = id => document.getElementById(id);
  const app = $('app'), nav = $('bottomNav'), msgsBox = $('msgs');
  if (!app || !nav || !msgsBox) throw new Error('Profile Hub: index.html ke elements nahi mile.');

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const btn = (label, fn, cls) => {
    const b = el('button', 'pf-btn' + (cls ? ' ' + cls : ''), label);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  };
  const safeImg = s => typeof s === 'string' && /^data:image\/(jpeg|png|webp|gif);base64,/.test(s) ? s : '';
  const fmt = ts => {
    const d = new Date(Number(ts) || 0);
    const same = d.toDateString() === new Date().toDateString();
    return same
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  const fbErr = e => (e && (e.code === 'PERMISSION_DENIED' || /permission/i.test(e.message || '')))
    ? 'Permission denied: Firebase rules mein friends/friendRequests add karo.'
    : ((e && e.message) || 'Error aaya.');

  // ---------- state ----------
  let me = null, db = null;
  let users = {}, names = {}, msgs = new Map(), incoming = {}, friends = {}, mentions = [];
  let friendsBlocked = false, initial = true, base = 0, mentionRe = null;
  let cardUid = null, outgoing = false, cardOnline = null, cardOff = null, ownNote = '';
  let offs = [];           // firebase listener detachers (login ke baad)
  const uiOffs = [];       // DOM listener detachers (plugin ki zindagi tak)

  const listen = (target, type, fn, opts) => {
    if (!target) return;
    target.addEventListener(type, fn, opts);
    uiOffs.push(() => target.removeEventListener(type, fn, opts));
  };

  // ---------- CSS ----------
  const style = el('style');
  style.textContent = `
  .pf-bell{position:relative}
  .pf-badge{position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;padding:0 4px;border-radius:99px;background:#f0788d;color:#fff;font-size:10px;font-weight:800;display:grid;place-items:center;border:2px solid #151d2d}
  .pf-badge[hidden]{display:none}
  .pf-panel{position:absolute;left:0;right:0;top:0;z-index:15;overflow-y:auto;background:#0c1220fa;padding:16px 14px 22px}
  .pf-panel[hidden],.pf-ov[hidden]{display:none}
  .pf-hero{display:flex;flex-direction:column;align-items:center;gap:6px;padding:6px 0 12px;text-align:center}
  .pf-hero h2{margin:6px 0 0;font-size:22px;overflow-wrap:anywhere}
  .pf-av{border-radius:50%;overflow:hidden;display:grid;place-items:center;flex:none;background:linear-gradient(135deg,#626fff,#a06cff);border:3px solid #7d83ff;color:#fff;font-weight:900}
  .pf-av img{width:100%;height:100%;object-fit:cover}
  .pf-tier{padding:5px 12px;border-radius:99px;background:#29345b;border:1px solid #4656a0;font-size:12px;font-weight:800}
  .pf-stats{display:grid;gap:8px;margin:8px 0 12px}
  .pf-stat{background:#1a2438;border:1px solid var(--line);border-radius:14px;padding:10px 6px;text-align:center}
  .pf-stat b{display:block;font-size:18px}.pf-stat span{font-size:10px;color:var(--muted)}
  .pf-bar{height:7px;border-radius:99px;background:#303d57;overflow:hidden;margin:5px 0}
  .pf-bar i{display:block;height:100%;background:linear-gradient(90deg,#5b7cff,#a17cff)}
  .pf-note{font-size:11px;color:var(--muted);line-height:1.5;margin:6px 0}
  .pf-h{font-size:13px;margin:16px 0 4px;color:#c2caff}
  .pf-btn{padding:10px 13px;font-size:13px}
  .pf-btn.secondary{background:#303b50}.pf-btn.danger{background:#a83d52}
  .pf-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:12px}
  .pf-pill{padding:9px 13px;border-radius:12px;background:#243049;font-size:13px;font-weight:700}.pf-pill.ok{background:#173629;color:#72e3ad}
  .pf-ov{position:fixed;inset:0;z-index:10000;background:#050812d9;display:flex;align-items:center;justify-content:center;padding:12px}
  .pf-card{width:min(420px,100%);max-height:88dvh;overflow:auto;background:#151e30;border:1px solid #394866;border-radius:19px;padding:16px;box-shadow:0 20px 70px #0009;position:relative}
  .pf-close{position:absolute;top:10px;right:10px;padding:6px 10px}
  .pf-row{display:flex;align-items:center;gap:10px;padding:9px;border-radius:12px;background:#1b263b;margin-top:7px}
  .pf-row .grow{flex:1;min-width:0}
  .pf-row b{display:block;font-size:13px;overflow-wrap:anywhere}
  .pf-row small{font-size:10px;color:var(--muted);display:block;line-height:1.4;overflow-wrap:anywhere}
  .pf-row .pf-btn{padding:7px 10px;font-size:12px}
  .pf-dot{width:9px;height:9px;border-radius:50%;background:#6d75ff;flex:none}
  .pf-link{cursor:pointer}
  .pf-mention{color:#9fb0ff;font-weight:700;cursor:pointer}
  .pf-mention.me{color:#ffd27a;background:#ffd27a22;border-radius:5px;padding:0 3px}
  .pf-flash{animation:pfflash 2.2s ease}
  @keyframes pfflash{0%,65%{box-shadow:0 0 0 3px #ffd27a}100%{box-shadow:0 0 0 0 #ffd27a00}}
  .pf-toast{position:fixed;left:50%;bottom:90px;transform:translateX(-50%) translateY(20px);opacity:0;pointer-events:none;z-index:10001;max-width:90vw;padding:10px 14px;border-radius:14px;background:#26325a;border:1px solid #5766c9;color:#fff;font-size:13px;transition:.25s}
  .pf-toast.show{opacity:1;transform:translateX(-50%);pointer-events:auto}
  #msgs .msg-avatar,#msgs .msg b,#membersList .member-row,#myAvatar{cursor:pointer}`;
  root.appendChild(style);

  // ---------- UI shell ----------
  const bell = el('button', 'icon-btn pf-bell', '🔔');
  bell.type = 'button'; bell.setAttribute('aria-label', 'Notifications');
  const badge = el('span', 'pf-badge', '0'); badge.hidden = true;
  bell.appendChild(badge);
  const membersBtn = $('membersOpen');
  if (membersBtn) membersBtn.after(bell); else ($('top') || app).appendChild(bell);

  const profileTab = el('button', 'nav-btn');
  profileTab.type = 'button'; profileTab.id = 'profileTab';
  profileTab.append(el('strong', '', '👤'), 'Profile');
  nav.appendChild(profileTab);
  const oldCols = nav.style.gridTemplateColumns;
  nav.style.gridTemplateColumns = '1fr 1fr 1fr';

  const panel = el('section', 'pf-panel'); panel.hidden = true; app.appendChild(panel);
  const card = el('section', 'pf-ov'); card.hidden = true; document.body.appendChild(card);
  const notif = el('section', 'pf-ov'); notif.hidden = true; document.body.appendChild(notif);
  const toastEl = el('div', 'pf-toast'); document.body.appendChild(toastEl);

  const fileDp = el('input'); fileDp.type = 'file'; fileDp.accept = 'image/*'; fileDp.hidden = true;
  const fileBg = el('input'); fileBg.type = 'file'; fileBg.accept = 'image/*'; fileBg.hidden = true;
  document.body.append(fileDp, fileBg);

  let toastTimer = 0;
  function toast(text, onTap) {
    toastEl.textContent = text;
    toastEl.onclick = onTap || null;
    toastEl.style.cursor = onTap ? 'pointer' : 'default';
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), onTap ? 6000 : 3500);
  }

  // ---------- helpers ----------
  const nameOf = uid => (users[uid] && users[uid].username) || 'Member';
  const uidByName = n => names[String(n || '').toLowerCase()] || null;
  function rebuildNames() {
    names = {};
    Object.keys(users).forEach(uid => { const n = users[uid] && users[uid].username; if (n) names[String(n).toLowerCase()] = uid; });
  }
  function avatar(uid, size) {
    const a = el('div', 'pf-av');
    a.style.width = a.style.height = size + 'px';
    a.style.fontSize = Math.round(size * 0.42) + 'px';
    const src = safeImg(users[uid] && users[uid].avatar);
    if (src) { const i = document.createElement('img'); i.src = src; i.alt = ''; a.appendChild(i); }
    else a.textContent = nameOf(uid).slice(0, 1).toUpperCase();
    return a;
  }
  // leaderboard jaisa hi ranking: message count, tie par username
  function stats() {
    const total = {};
    msgs.forEach(m => { if (m && m.uid && !m.system && typeof m.text === 'string') total[m.uid] = (total[m.uid] || 0) + 1; });
    const rows = Object.keys(users).map(uid => ({ uid, name: nameOf(uid), total: total[uid] || 0 }));
    rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    const out = {};
    rows.forEach((r, i) => { out[r.uid] = { ...r, rank: i + 1 }; });
    return { out, count: rows.length };
  }
  function tierOf(n) {
    let i = 0;
    TIERS.forEach((t, idx) => { if (n >= t[0]) i = idx; });
    return { name: TIERS[i][1], icon: TIERS[i][2], min: TIERS[i][0], next: TIERS[i + 1] || null };
  }
  function statBox(value, label) {
    const d = el('div', 'pf-stat'); d.append(el('b', '', String(value)), el('span', '', label)); return d;
  }
  function heroBlock(uid, size, extraLine) {
    const h = el('div', 'pf-hero');
    h.append(avatar(uid, size), el('h2', '', nameOf(uid)));
    if (extraLine) h.appendChild(extraLine);
    return h;
  }

  let rt = 0;
  function scheduleRefresh() {
    clearTimeout(rt);
    rt = setTimeout(() => {
      if (!panel.hidden) renderOwn();
      if (!card.hidden) renderCard();
      if (!notif.hidden) renderNotif();
    }, 250);
  }

  // ---------- image helpers ----------
  function toDataURL(file, maxSize, quality) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith('image/')) return reject(new Error('Valid image choose karo.'));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Image read nahi hui.'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Image open nahi hui.'));
        img.onload = () => {
          const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * scale));
          c.height = Math.max(1, Math.round(img.height * scale));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }
  function applyBg() {
    let bg = '';
    try { bg = localStorage.getItem(BG_KEY) || ''; } catch (_) {}
    document.body.style.backgroundImage = bg ? `url("${bg}")` : '';
    app.style.backgroundImage = bg ? `linear-gradient(#0c1220d9,#0c1220e8),url("${bg}")` : '';
    app.style.backgroundSize = 'cover';
    app.style.backgroundPosition = 'center';
  }
  function setNote(t) { ownNote = t; if (!panel.hidden) renderOwn(); }

  listen(fileDp, 'change', async e => {
    const f = e.target.files && e.target.files[0];
    if (!f || !me) return;
    setNote('DP save ho rahi hai...');
    try {
      const data = await toDataURL(f, 180, 0.72);
      await db.ref('users/' + me.uid + '/avatar').set(data);
      setNote('✅ DP sabhi members ke liye update ho gayi.');
    } catch (err) { setNote('DP save nahi hui: ' + fbErr(err)); }
    finally { e.target.value = ''; }
  });
  listen(fileBg, 'change', async e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setNote('Background set ho raha hai...');
    try {
      const data = await toDataURL(f, 1400, 0.78);
      localStorage.setItem(BG_KEY, data);
      applyBg();
      setNote('✅ Background sirf is device par set hua.');
    } catch (err) { setNote('Background set nahi hua: ' + (err.message || 'error')); }
    finally { e.target.value = ''; }
  });

  // ---------- own profile (tab) ----------
  function setActive(id) {
    ['chatTab', 'leaderboardTab', 'profileTab'].forEach(t => { const b = $(t); if (b) b.classList.toggle('active', t === id); });
  }
  function openOwn() {
    if (!me) return;
    closeCard(); closeNotif();
    const lb = document.querySelector('.lb-wrap.open');
    if (lb) lb.classList.remove('open');
    panel.style.bottom = nav.offsetHeight + 'px';
    panel.hidden = false;
    renderOwn();
    setActive('profileTab');
  }
  function closeOwn() { panel.hidden = true; profileTab.classList.remove('active'); }

  function renderOwn() {
    if (!me) return;
    const keep = panel.scrollTop;
    const st = stats();
    const mine = st.out[me.uid] || { rank: '-', total: 0 };
    const tier = tierOf(mine.total);
    const wrap = el('div');

    wrap.appendChild(heroBlock(me.uid, 120, el('div', 'pf-tier', tier.icon + ' ' + tier.name)));
    if (tier.next) {
      const pct = Math.min(100, Math.round(((mine.total - tier.min) / (tier.next[0] - tier.min)) * 100));
      const bar = el('div', 'pf-bar'); const fill = el('i'); fill.style.width = pct + '%'; bar.appendChild(fill);
      wrap.append(bar, el('div', 'pf-note', tier.next[1] + ' ke liye ' + Math.max(0, tier.next[0] - mine.total) + ' messages aur'));
    } else wrap.appendChild(el('div', 'pf-note', 'Top tier pe ho 💎'));

    const grid = el('div', 'pf-stats'); grid.style.gridTemplateColumns = 'repeat(3,1fr)';
    grid.append(statBox('#' + mine.rank, 'Rank (' + st.count + ')'), statBox(mine.total, 'Messages'), statBox(Object.keys(friends).length, 'Friends'));
    wrap.appendChild(grid);

    const acts = el('div', 'pf-actions');
    acts.append(btn('🖼️ Change DP', () => fileDp.click()), btn('🌌 Change Background', () => fileBg.click()),
      btn('↩️ Reset Background', () => { try { localStorage.removeItem(BG_KEY); } catch (_) {} applyBg(); setNote('Default background restored.'); }, 'secondary'));
    wrap.appendChild(acts);
    if (ownNote) wrap.appendChild(el('div', 'pf-note', ownNote));

    wrap.appendChild(el('div', 'pf-h', '👥 Friends'));
    const ids = Object.keys(friends);
    if (!ids.length) wrap.appendChild(el('div', 'pf-note', friendsBlocked ? 'Friend system ke liye Firebase rules update karni hongi.' : 'Abhi koi friend nahi. Kisi ki profile khol ke request bhejo.'));
    ids.sort((a, b) => nameOf(a).localeCompare(nameOf(b))).forEach(uid => {
      const row = el('div', 'pf-row pf-link');
      const g = el('div', 'grow'); g.appendChild(el('b', '', nameOf(uid)));
      row.append(avatar(uid, 38), g);
      row.addEventListener('click', () => openCard(uid));
      wrap.appendChild(row);
    });

    const out = el('div', 'pf-actions'); out.style.marginTop = '22px';
    out.appendChild(btn('↪ Logout', () => { const o = $('out'); if (o) o.click(); }, 'danger'));
    wrap.appendChild(out);

    panel.replaceChildren(wrap);
    panel.scrollTop = keep;
  }

  // ---------- visit card ----------
  function stopCard() { if (cardOff) { try { cardOff(); } catch (_) {} cardOff = null; } }
  function openCard(uid) {
    if (!me || !uid) return;
    if (uid === me.uid) { openOwn(); return; }
    closeNotif(); stopCard();
    cardUid = uid; outgoing = false; cardOnline = null;
    const r = db.ref('friendRequests/' + uid + '/' + me.uid);
    const cb = s => { outgoing = s.exists(); renderCard(); };
    r.on('value', cb, () => {});
    cardOff = () => r.off('value', cb);
    db.ref('online/' + uid).once('value').then(s => { if (cardUid === uid) { cardOnline = s.exists(); renderCard(); } }).catch(() => {});
    card.hidden = false;
    renderCard();
  }
  function closeCard() { card.hidden = true; cardUid = null; stopCard(); }

  function friendArea(uid) {
    const box = el('div', 'pf-actions');
    if (friendsBlocked) { box.appendChild(el('div', 'pf-note', 'Friend system abhi band hai: Firebase rules update karni hongi.')); return box; }
    if (friends[uid]) box.appendChild(el('div', 'pf-pill ok', '✓ Friends'));
    else if (incoming[uid]) box.append(btn('✓ Accept', () => acceptReq(uid)), btn('✕ Reject', () => rejectReq(uid), 'secondary'));
    else if (outgoing) box.append(el('div', 'pf-pill', '⏳ Request bhej di'), btn('Cancel', () => cancelReq(uid), 'secondary'));
    else box.appendChild(btn('➕ Friend request bhejo', () => sendReq(uid)));
    return box;
  }

  function renderCard() {
    if (!cardUid || !me) return;
    const uid = cardUid;
    const st = stats();
    const s = st.out[uid] || { rank: '-', total: 0 };
    const tier = tierOf(s.total);
    const inner = el('div');
    const close = btn('✕', closeCard, 'secondary pf-close');
    const line = el('div', 'pf-note', cardOnline == null ? '' : (cardOnline ? '● Online' : 'Offline'));
    if (cardOnline) line.style.color = '#55d9a0';
    inner.append(close, heroBlock(uid, 110, line), el('div', 'pf-actions', ''));
    inner.lastChild.appendChild(el('div', 'pf-tier', tier.icon + ' ' + tier.name));
    const grid = el('div', 'pf-stats'); grid.style.gridTemplateColumns = 'repeat(2,1fr)';
    grid.append(statBox('#' + s.rank, 'Rank (' + st.count + ')'), statBox(s.total, 'Messages'));
    inner.append(grid, friendArea(uid));
    card.replaceChildren(el('div', 'pf-card'));
    card.firstChild.appendChild(inner);
  }
  listen(card, 'click', e => { if (e.target === card) closeCard(); });

  // ---------- friend actions ----------
  async function sendReq(uid) {
    if (!me || uid === me.uid) return;
    try {
      await db.ref('friendRequests/' + uid + '/' + me.uid).set({ from: me.username, ts: firebase.database.ServerValue.TIMESTAMP });
      toast('Friend request bhej di ✅');
    } catch (e) { toast(fbErr(e)); }
  }
  async function cancelReq(uid) {
    try { await db.ref('friendRequests/' + uid + '/' + me.uid).remove(); } catch (e) { toast(fbErr(e)); }
  }
  async function acceptReq(uid) {
    try {
      const up = {};
      up['friends/' + me.uid + '/' + uid] = true;
      up['friends/' + uid + '/' + me.uid] = true;
      up['friendRequests/' + me.uid + '/' + uid] = null;
      await db.ref().update(up);
      toast('Ab tum ' + nameOf(uid) + ' ke friend ho 🎉');
    } catch (e) { toast(fbErr(e)); }
  }
  async function rejectReq(uid) {
    try { await db.ref('friendRequests/' + me.uid + '/' + uid).remove(); } catch (e) { toast(fbErr(e)); }
  }

  // ---------- mentions ----------
  const mKey = () => 'pf_mentions_' + me.uid;
  const bKey = () => 'pf_mbase_' + me.uid;
  function loadMentions() {
    try { mentions = JSON.parse(localStorage.getItem(mKey()) || '[]'); } catch (_) { mentions = []; }
    if (!Array.isArray(mentions)) mentions = [];
    let b = 0;
    try { b = Number(localStorage.getItem(bKey())); } catch (_) {}
    if (!b) { b = Date.now(); try { localStorage.setItem(bKey(), String(b)); } catch (_) {} }
    base = b;
  }
  function saveMentions() {
    try { localStorage.setItem(mKey(), JSON.stringify(mentions.slice(0, 50))); } catch (_) {}
  }
  function onMessage(key, m) {
    const ts = Number(m.ts || 0);
    if (!mentionRe || !ts || m.uid === me.uid || typeof m.text !== 'string' || ts <= base) return;
    base = ts;
    try { localStorage.setItem(bKey(), String(base)); } catch (_) {}
    if (!mentionRe.test(m.text) || mentions.some(x => x.key === key)) return;
    const from = m.user || nameOf(m.uid);
    mentions.unshift({ key, from, text: m.text.slice(0, 80), ts, read: false });
    mentions = mentions.slice(0, 50);
    saveMentions();
    if (!initial) toast('@' + from + ' mentioned you in a message', () => { markRead(key); jumpTo(key); });
    updateBadge();
  }
  function markRead(key) {
    const m = mentions.find(x => x.key === key);
    if (m && !m.read) { m.read = true; saveMentions(); updateBadge(); }
  }
  function jumpTo(key) {
    closeOwn(); closeNotif(); closeCard();
    const lbClose = document.querySelector('.lb-wrap.open .lb-close');
    if (lbClose) lbClose.click();
    const ct = $('chatTab'); if (ct) ct.click();
    setTimeout(() => {
      const sel = '[data-key="' + (window.CSS && CSS.escape ? CSS.escape(key) : key) + '"]';
      const art = msgsBox.querySelector(sel);
      if (!art) { toast('Ye message ab chat mein loaded nahi hai (sirf last 100 messages dikhte hain).'); return; }
      art.scrollIntoView({ block: 'center', behavior: 'smooth' });
      art.classList.add('pf-flash');
      setTimeout(() => art.classList.remove('pf-flash'), 2300);
    }, 120);
  }

  // chat ke andar @username ko highlight + clickable banana
  function linkMentions(node) {
    const text = node.textContent;
    const re = /@([A-Za-z0-9_]{2,20})/g;
    const frag = document.createDocumentFragment();
    let last = 0, any = false, m;
    while ((m = re.exec(text))) {
      const uid = uidByName(m[1]);
      if (!uid) continue;
      any = true;
      frag.append(text.slice(last, m.index));
      const s = el('span', 'pf-mention' + (me && uid === me.uid ? ' me' : ''), '@' + m[1]);
      s.dataset.uid = uid;
      frag.append(s);
      last = m.index + m[0].length;
    }
    if (!any) return;
    frag.append(text.slice(last));
    node.replaceChildren(frag);
  }
  function decorate(row) {
    if (row.dataset.pf) return;
    row.dataset.pf = '1';
    const art = row.querySelector('article.msg');
    if (!art) return;
    const content = art.querySelector(':scope > span:not(.stamp)');
    if (content && content.textContent.includes('@')) linkMentions(content);
  }
  const mo = new MutationObserver(list => list.forEach(r => r.addedNodes.forEach(n => {
    if (n.nodeType === 1 && n.classList.contains('msg-row')) decorate(n);
  })));
  mo.observe(msgsBox, { childList: true });
  msgsBox.querySelectorAll('.msg-row').forEach(decorate);

  listen(msgsBox, 'click', e => {
    const mention = e.target.closest('.pf-mention');
    if (mention) { openCard(mention.dataset.uid); return; }
    if (!e.target.closest('.msg-avatar') && !e.target.closest('article.msg > b')) return;
    const art = e.target.closest('.msg-row') && e.target.closest('.msg-row').querySelector('article.msg');
    const m = art && msgs.get(art.dataset.key);
    if (m && m.uid) openCard(m.uid);
  });
  listen($('membersList'), 'click', e => {
    const row = e.target.closest('.member-row');
    if (!row) return;
    const b = row.querySelector('.member-info b');
    const uid = uidByName(b && b.textContent);
    if (!uid) return;
    const mm = $('membersModal'); if (mm) mm.classList.remove('open');
    openCard(uid);
  });
  listen($('myAvatar'), 'click', () => openOwn());

  // ---------- notifications ----------
  const unreadCount = () => Object.keys(incoming).length + mentions.filter(m => !m.read).length;
  function updateBadge() {
    const n = unreadCount();
    badge.textContent = n > 9 ? '9+' : String(n);
    badge.hidden = n === 0;
    if (!notif.hidden) renderNotif();
  }
  function openNotif() { if (!me) return; closeCard(); notif.hidden = false; renderNotif(); }
  function closeNotif() { notif.hidden = true; }

  function renderNotif() {
    const box = el('div', 'pf-card');
    const head = el('div', 'pf-h', '🔔 Notifications'); head.style.marginTop = '0';
    box.append(btn('✕', closeNotif, 'secondary pf-close'), head);

    const reqIds = Object.keys(incoming);
    box.appendChild(el('div', 'pf-h', '👥 Friend requests (' + reqIds.length + ')'));
    if (!reqIds.length) box.appendChild(el('div', 'pf-note', friendsBlocked ? 'Friend system ke liye Firebase rules update karni hongi.' : 'Koi pending request nahi.'));
    reqIds.forEach(uid => {
      const row = el('div', 'pf-row');
      const av = avatar(uid, 38); av.classList.add('pf-link'); av.addEventListener('click', () => openCard(uid));
      const g = el('div', 'grow'); g.append(el('b', '', (incoming[uid] && incoming[uid].from) || nameOf(uid)), el('small', '', 'ne friend request bheji'));
      row.append(av, g, btn('✓', () => acceptReq(uid)), btn('✕', () => rejectReq(uid), 'secondary'));
      box.appendChild(row);
    });

    box.appendChild(el('div', 'pf-h', '@ Mentions'));
    if (!mentions.length) box.appendChild(el('div', 'pf-note', 'Abhi kisi ne mention nahi kiya.'));
    else if (mentions.some(m => !m.read)) {
      const all = btn('Sab read mark karo', () => { mentions.forEach(m => { m.read = true; }); saveMentions(); updateBadge(); }, 'secondary');
      all.style.marginTop = '6px'; box.appendChild(all);
    }
    mentions.forEach(m => {
      const row = el('div', 'pf-row pf-link');
      const g = el('div', 'grow');
      g.append(el('b', '', '@' + m.from + ' mentioned you in a message'), el('small', '', m.text), el('small', '', fmt(m.ts)));
      row.appendChild(g);
      if (!m.read) row.appendChild(el('span', 'pf-dot'));
      row.addEventListener('click', () => { markRead(m.key); jumpTo(m.key); });
      box.appendChild(row);
    });
    notif.replaceChildren(box);
  }
  listen(notif, 'click', e => { if (e.target === notif) closeNotif(); });
  listen(bell, 'click', () => (notif.hidden ? openNotif() : closeNotif()));

  // ---------- tabs ----------
  listen(profileTab, 'click', () => { if (panel.hidden) openOwn(); else { const ct = $('chatTab'); if (ct) ct.click(); } });
  listen($('chatTab'), 'click', closeOwn);
  listen($('leaderboardTab'), 'click', closeOwn);

  // ---------- firebase wiring ----------
  function attach(ref, evt, cb, errCb) {
    ref.on(evt, cb, errCb || (err => console.warn('[ProfileHub]', err && err.message)));
    offs.push(() => ref.off(evt, cb));
  }

  function start(user) {
    if (!user || !window.firebase || !firebase.database) return;
    stop();
    me = user; db = firebase.database();
    friendsBlocked = false; initial = true; ownNote = '';
    loadMentions();
    mentionRe = new RegExp('(^|[^A-Za-z0-9_])@' + String(me.username).replace(/[^A-Za-z0-9_]/g, '') + '(?![A-Za-z0-9_])', 'i');
    applyBg();

    attach(db.ref('users'), 'value', s => { users = s.val() || {}; rebuildNames(); scheduleRefresh(); });

    const mref = db.ref('messages').limitToLast(1500);
    attach(mref, 'child_added', s => { const m = s.val(); if (!m) return; msgs.set(s.key, m); onMessage(s.key, m); scheduleRefresh(); });
    attach(mref, 'child_removed', s => { msgs.delete(s.key); scheduleRefresh(); });
    mref.once('value').then(() => { initial = false; }).catch(() => { initial = false; });

    attach(db.ref('friendRequests/' + me.uid), 'value', s => { incoming = s.val() || {}; updateBadge(); scheduleRefresh(); },
      err => { friendsBlocked = true; console.warn('[ProfileHub] friendRequests', err && err.message); scheduleRefresh(); });
    attach(db.ref('friends/' + me.uid), 'value', s => { friends = s.val() || {}; scheduleRefresh(); },
      err => { friendsBlocked = true; console.warn('[ProfileHub] friends', err && err.message); scheduleRefresh(); });

    msgsBox.querySelectorAll('.msg-row').forEach(r => { delete r.dataset.pf; decorate(r); });
    updateBadge();
  }

  function stop() {
    offs.forEach(f => { try { f(); } catch (_) {} });
    offs = [];
    users = {}; names = {}; msgs = new Map(); incoming = {}; friends = {}; mentions = [];
    me = null; mentionRe = null;
    closeOwn(); closeCard(); closeNotif();
    badge.hidden = true;
  }

  if (getUser()) start(getUser());
  const offLogin = on('login', user => start(user));
  const offLogout = on('logout', () => stop());

  return () => {
    offLogin(); offLogout();
    stop();
    mo.disconnect();
    uiOffs.forEach(f => { try { f(); } catch (_) {} });
    nav.style.gridTemplateColumns = oldCols;
    [style, bell, profileTab, panel, card, notif, toastEl, fileDp, fileBg].forEach(n => n.remove());
  };
}
