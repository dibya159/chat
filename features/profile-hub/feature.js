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
  .pf-title{display:inline-flex;align-items:center;gap:4px;max-width:100%}
  .pf-tname.dim{opacity:.55;font-weight:600}
  .pf-pen{background:none!important;box-shadow:none!important;border:0;padding:2px 6px;font-size:14px;color:inherit;cursor:pointer}
  .pf-tin{width:150px;max-width:48vw;padding:5px 8px;border-radius:8px;border:1px solid #5a68c8;background:#0f1726;color:#fff;font:inherit;font-size:15px}
  .pf-bell{position:relative}
  .pf-badge{position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;padding:0 4px;border-radius:99px;background:#f0788d;color:#fff;font-size:10px;font-weight:800;display:grid;place-items:center;border:2px solid #151d2d}
  .pf-badge[hidden]{display:none}
  .pf-panel{position:absolute;left:0;right:0;top:0;z-index:15;overflow-y:auto;background:#0c1220fa;padding:16px 14px 22px}
  .pf-panel[hidden],.pf-ov[hidden]{display:none}
  .pf-hero{display:flex;flex-direction:column;align-items:center;gap:6px;padding:6px 0 12px;text-align:center}
  .pf-hero h2{margin:6px 0 0;font-size:22px;overflow-wrap:anywhere}
  .pf-av{border-radius:50%;overflow:hidden;display:grid;place-items:center;flex:none;background:linear-gradient(135deg,#626fff,#a06cff);border:3px solid #7d83ff;color:#fff;font-weight:900}
  .pf-av img{width:100%;height:100%;object-fit:cover}
.pf-avwrap{position:relative}
  .pf-plus{position:absolute;right:-2px;bottom:-2px;width:36px;height:36px;border-radius:50%;padding:0;font-size:24px;line-height:1;font-weight:900;border:3px solid #0c1220;display:grid;place-items:center}
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
  const oldGrid = [nav.style.gridTemplateColumns, nav.style.gridAutoFlow, nav.style.gridAutoColumns];
  nav.style.gridTemplateColumns = 'none'; nav.style.gridAutoFlow = 'column'; nav.style.gridAutoColumns = '1fr';

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

  // ---------- custom chat name (header title) ----------
  const brandText = $('brandText');
  const titleNode = brandText && brandText.firstChild && brandText.firstChild.nodeType === 3 ? brandText.firstChild : null;
  const origTitle = titleNode ? titleNode.nodeValue : '';
  const titleBox = el('span', 'pf-title');
  if (brandText) brandText.insertBefore(titleBox, $('welcome') || null);
  let editing = false;
  function renderTitle() { if (!editing) paintTitle(); }
  function paintTitle() {
    if (!brandText || !me) return;
    if (titleNode) titleNode.nodeValue = '';
    const name = (users[me.uid] && users[me.uid].chatName) || '';
    titleBox.replaceChildren();
    if (editing) {
      const inp = el('input', 'pf-tin'); inp.maxLength = 20; inp.value = name; inp.placeholder = 'Enter your name';
      const save = async () => {
        const v = inp.value.trim().slice(0, 20);
        try { await db.ref('users/' + me.uid + '/chatName').set(v || null); if (users[me.uid]) users[me.uid].chatName = v || undefined; } catch (e) { toast(fbErr(e)); }
        editing = false; paintTitle();
      };
      const ok = el('button', 'pf-pen', '✓'); ok.type = 'button'; ok.addEventListener('click', save);
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { editing = false; paintTitle(); } });
      titleBox.append(inp, ok); setTimeout(() => inp.focus(), 0);
    } else {
      titleBox.appendChild(el('span', 'pf-tname' + (name ? '' : ' dim'), name || 'Enter your name'));
      const pen = el('button', 'pf-pen', '✏️'); pen.type = 'button'; pen.setAttribute('aria-label', 'Name badlo');
      pen.addEventListener('click', () => { editing = true; paintTitle(); });
      titleBox.appendChild(pen);
    }
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
  function heroBlock(uid, size, extraLine, withPlus) {
    const h = el('div', 'pf-hero');
    let av = avatar(uid, size);
    if (withPlus && window.dostoStory) {
      const w = el('div', 'pf-avwrap'); w.appendChild(av);
      const p = el('button', 'pf-plus', '+'); p.type = 'button'; p.setAttribute('aria-label', 'Story lagao');
      p.addEventListener('click', () => window.dostoStory.add());
      w.appendChild(p); av = w;
    }
    h.append(av, el('h2', '', nameOf(uid)));
    const cn = users[uid] && users[uid].chatName;
    if (cn) h.appendChild(el('div', 'pf-note', 'Name: ' + cn));
    if (extraLine) h.appendChild(extraLine);
    return h;
  }

  let rt = 0;
  function scheduleRefresh() {
    clearTimeout(rt);
    rt = setTimeout(() => {
      renderTitle();
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
    nav.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.id === id));
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

    wrap.appendChild(heroBlock(me.uid, 120, el('div', 'pf-tier', tier.icon + ' ' + tier.name), true));
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
    inner.append(close, heroBlock(uid, 110, line));
    const tierRow = el('div', 'pf-actions'); tierRow.appendChild(el('div', 'pf-tier', tier.icon + ' ' + tier.name));
    const grid = el('div', 'pf-stats'); grid.style.gridTemplateColumns = 'repeat(2,1fr)';
    grid.append(statBox('#' + s.rank, 'Rank (' + st.count + ')'), statBox(s.total, 'Messages'));
    inner.append(tierRow, grid, friendArea(uid));
    if (friends[uid] && window.DostoDM) {
      const dm = el('div', 'pf-actions');
      dm.appendChild(btn('✉️ Message', () => { closeCard(); window.DostoDM.open(uid); }));
      inner.appendChild(dm);
    }
    const box = el('div', 'pf-card'); box.appendChild(inner);
    card.replaceChildren(box);
  }
  listen(card, 'click', e => { if (e.target === card) closeCard(); });

  // ---------- friend request actions ----------
  const TS = () => firebase.database.ServerValue.TIMESTAMP;
  const denied = e => !!(e && (e.code === 'PERMISSION_DENIED' || /permission/i.test(e.message || '')));
  async function sendReq(uid) {
    if (!me || uid === me.uid) return;
    try { await db.ref('friendRequests/' + uid + '/' + me.uid).set({ from: me.uid, ts: TS() }); toast('Friend request bhej di ✅'); }
    catch (e) { toast(fbErr(e)); }
  }
  async function cancelReq(uid) {
    try { await db.ref('friendRequests/' + uid + '/' + me.uid).remove(); toast('Request cancel ho gayi.'); }
    catch (e) { toast(fbErr(e)); }
  }
  async function acceptReq(uid) {
    try {
      const upd = {};
      upd['friends/' + me.uid + '/' + uid] = true;
      upd['friends/' + uid + '/' + me.uid] = true;
      upd['friendRequests/' + me.uid + '/' + uid] = null;
      await db.ref().update(upd);
      toast('Ab aap friends ho 🎉');
    } catch (e) { toast(fbErr(e)); }
  }
  async function rejectReq(uid) {
    try { await db.ref('friendRequests/' + me.uid + '/' + uid).remove(); toast('Request reject ho gayi.'); }
    catch (e) { toast(fbErr(e)); }
  }

  // ---------- notifications (bell) ----------
  let unseenMentions = 0, reqInit = true;
  function updateBadge() {
    const n = Object.keys(incoming).length + unseenMentions;
    badge.hidden = !n; badge.textContent = n > 99 ? '99+' : String(n);
  }
  function openNotif() { if (!me) return; closeCard(); unseenMentions = 0; updateBadge(); notif.hidden = false; renderNotif(); }
  function closeNotif() { notif.hidden = true; }
  function jumpTo(key) {
    const ct = $('chatTab'); if (ct) ct.click();
    setTimeout(() => {
      const art = msgsBox.querySelector('[data-key="' + (window.CSS && CSS.escape ? CSS.escape(key) : key) + '"]');
      if (!art) { toast('Ye message ab chat mein loaded nahi hai.'); return; }
      art.scrollIntoView({ block: 'center', behavior: 'smooth' });
      art.classList.add('pf-flash'); setTimeout(() => art.classList.remove('pf-flash'), 2300);
    }, 60);
  }
  function renderNotif() {
    if (!me) return;
    const box = el('div', 'pf-card');
    box.append(btn('✕', closeNotif, 'secondary pf-close'), el('div', 'pf-h', '🔔 Notifications'));
    box.appendChild(el('div', 'pf-h', '👥 Friend requests'));
    const ids = Object.keys(incoming).sort((a, b) => (Number(incoming[b] && incoming[b].ts) || 0) - (Number(incoming[a] && incoming[a].ts) || 0));
    if (!ids.length) box.appendChild(el('div', 'pf-note', friendsBlocked ? 'Friend system ke liye Firebase rules update karni hongi.' : 'Koi pending request nahi.'));
    ids.forEach(uid => {
      const row = el('div', 'pf-row'), g = el('div', 'grow pf-link');
      g.append(el('b', '', nameOf(uid)), el('small', '', 'Friend request • ' + fmt(incoming[uid] && incoming[uid].ts)));
      g.addEventListener('click', () => openCard(uid));
      row.append(avatar(uid, 38), g, btn('✓', () => acceptReq(uid)), btn('✕', () => rejectReq(uid), 'secondary'));
      box.appendChild(row);
    });
    box.appendChild(el('div', 'pf-h', '@ Mentions'));
    if (!mentions.length) box.appendChild(el('div', 'pf-note', 'Kisi ne abhi tak mention nahi kiya.'));
    mentions.forEach(m => {
      const row = el('div', 'pf-row pf-link'), g = el('div', 'grow');
      g.append(el('b', '', nameOf(m.uid) + ' ne mention kiya'), el('small', '', String(m.text).replace(/^⟦r:[A-Za-z0-9_-]+⟧/, '').slice(0, 100) + ' • ' + fmt(m.ts)));
      row.append(avatar(m.uid, 38), g);
      row.addEventListener('click', () => { closeNotif(); jumpTo(m.key); });
      box.appendChild(row);
    });
    notif.replaceChildren(box);
  }
  listen(bell, 'click', () => { if (notif.hidden) openNotif(); else closeNotif(); });
  listen(notif, 'click', e => { if (e.target === notif) closeNotif(); });

  // ---------- chat clicks + @mentions in messages ----------
  function decorateMentions(row) {
    const art = row.querySelector && row.querySelector('article.msg');
    const content = art && art.querySelector(':scope > span:not(.stamp)');
    if (!content) return;
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT), nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(tn => {
      if (tn.parentElement && tn.parentElement.classList.contains('pf-mention')) return;
      const txt = tn.nodeValue; if (txt.indexOf('@') < 0) return;
      const re = /(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{2,20})(?![A-Za-z0-9_])/g;
      let last = 0, m, frag = null;
      while ((m = re.exec(txt))) {
        const uid = uidByName(m[2]); if (!uid) continue;
        frag = frag || document.createDocumentFragment();
        const at = m.index + m[1].length;
        frag.appendChild(document.createTextNode(txt.slice(last, at)));
        const sp = el('span', 'pf-mention' + (me && uid === me.uid ? ' me' : ''), '@' + m[2]);
        sp.dataset.name = m[2]; frag.appendChild(sp);
        last = at + 1 + m[2].length;
      }
      if (frag) { frag.appendChild(document.createTextNode(txt.slice(last))); tn.replaceWith(frag); }
    });
  }
  const redecorate = () => msgsBox.querySelectorAll('.msg-row').forEach(decorateMentions);
  const mo = new MutationObserver(list => list.forEach(r => r.addedNodes.forEach(n => {
    if (n.nodeType === 1 && n.classList.contains('msg-row')) decorateMentions(n);
  })));
  mo.observe(msgsBox, { childList: true });

  listen(msgsBox, 'click', e => {
    const men = e.target.closest('.pf-mention');
    if (men) { const u = uidByName(men.dataset.name); if (u) openCard(u); return; }
    const av = e.target.closest('.msg-avatar'), nm = e.target.closest('b');
    const art = av ? av.closest('.msg-row') && av.closest('.msg-row').querySelector('article.msg') : (nm && nm.parentElement && nm.parentElement.matches('article.msg') ? nm.parentElement : null);
    if (!art) return;
    const m = msgs.get(art.dataset.key);
    const u = (m && m.uid) || uidByName((art.querySelector(':scope > b') || {}).textContent);
    if (u) openCard(u);
  });
  listen($('membersList'), 'click', e => {
    const row = e.target.closest('.member-row'); if (!row) return;
    const b = row.querySelector('b'), u = uidByName(b && b.textContent); if (!u) return;
    const mc = $('membersClose'); if (mc) mc.click();
    openCard(u);
  });
  listen($('myAvatar'), 'click', openOwn);

  // ---------- tab ----------
  listen(profileTab, 'click', () => { if (panel.hidden) openOwn(); else { const ct = $('chatTab'); if (ct) ct.click(); } });
  listen(nav, 'click', e => { const b = e.target.closest('.nav-btn'); if (b && b !== profileTab) closeOwn(); });

  // ---------- session ----------
  const attach = (ref, ev, cb, errCb) => { ref.on(ev, cb, errCb || (() => {})); offs.push(() => ref.off(ev, cb)); };
  function start(user) {
    stop();
    if (!user || !window.firebase || !firebase.database) return;
    me = user; db = firebase.database(); initial = true; reqInit = true; unseenMentions = 0; mentions = [];
    mentionRe = new RegExp('(^|[^A-Za-z0-9_])@' + String(user.username || '').replace(/[^A-Za-z0-9_]/g, '') + '(?![A-Za-z0-9_])', 'i');
    applyBg();
    attach(db.ref('users'), 'value', s => { users = s.val() || {}; rebuildNames(); redecorate(); scheduleRefresh(); });
    attach(db.ref('friends/' + me.uid), 'value', s => { friends = s.val() || {}; friendsBlocked = false; scheduleRefresh(); },
      e => { if (denied(e)) friendsBlocked = true; scheduleRefresh(); });
    attach(db.ref('friendRequests/' + me.uid), 'value', s => {
      const next = s.val() || {};
      if (!reqInit) Object.keys(next).forEach(u => { if (!incoming[u]) toast('👥 ' + nameOf(u) + ' ne friend request bheji', openNotif); });
      reqInit = false; incoming = next; updateBadge(); scheduleRefresh();
    }, e => { if (denied(e)) friendsBlocked = true; scheduleRefresh(); });
    const mref = db.ref('messages').limitToLast(300);
    attach(mref, 'child_added', s => {
      const v = s.val(); if (!v) return;
      msgs.set(s.key, v);
      if (typeof v.text === 'string' && v.uid !== me.uid && mentionRe.test(v.text)) {
        mentions.unshift({ key: s.key, uid: v.uid, text: v.text, ts: v.ts });
        if (mentions.length > 30) mentions.length = 30;
        if (!initial) { unseenMentions++; updateBadge(); toast('@ ' + nameOf(v.uid) + ' ne aapko mention kiya', openNotif); }
      }
      if (!initial) scheduleRefresh();
    });
    attach(mref, 'child_removed', s => { msgs.delete(s.key); mentions = mentions.filter(m => m.key !== s.key); });
    mref.once('value').then(() => { initial = false; scheduleRefresh(); }).catch(() => { initial = false; });
    scheduleRefresh();
  }
  function stop() {
    offs.forEach(f => { try { f(); } catch (_) {} }); offs = [];
    clearTimeout(rt);
    me = null; db = null; users = {}; names = {}; msgs = new Map(); incoming = {}; friends = {}; mentions = [];
    unseenMentions = 0; editing = false; friendsBlocked = false;
    titleBox.replaceChildren(); if (titleNode) titleNode.nodeValue = origTitle;
    closeOwn(); closeCard(); closeNotif(); updateBadge();
  }

  if (getUser()) start(getUser());
  const offLogin = on('login', u => start(u));
  const offLogout = on('logout', () => stop());

  return () => {
    offLogin(); offLogout(); stop(); mo.disconnect();
    uiOffs.forEach(f => { try { f(); } catch (_) {} });
    clearTimeout(toastTimer);
    msgsBox.querySelectorAll('.pf-mention').forEach(sp => sp.replaceWith(document.createTextNode(sp.textContent)));
    [style, titleBox, bell, profileTab, panel, card, notif, toastEl, fileDp, fileBg].forEach(n => n.remove());
    nav.style.gridTemplateColumns = oldGrid[0]; nav.style.gridAutoFlow = oldGrid[1]; nav.style.gridAutoColumns = oldGrid[2];
  };
}
