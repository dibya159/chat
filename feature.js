/* Dosto ka Chat - Stories (WhatsApp status jaisa)
   Photo + caption, 24 ghante, sirf friends / sare members, like, comments, viewers list,
   report, kisi se chhupao, apni story delete. index.html ko chhedna nahi padta. */
export default function ({ root, getUser, on }) {
  const ADMIN_UID = 'TkdZFaOuM8huIE3I5l6TSWHfHnY2';
  const DAY = 86400000, SLIDE = 5000, MAX_CAP = 150, MAX_CMT = 200;
  const $ = id => document.getElementById(id);
  const app = $('app'), msgsBox = $('msgs');
  if (!app || !msgsBox) throw new Error('Stories: index.html ke elements nahi mile.');

  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const btn = (label, fn, cls) => { const b = el('button', 'st-btn' + (cls ? ' ' + cls : ''), label); b.type = 'button'; b.addEventListener('click', fn); return b; };
  const safeImg = s => typeof s === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(s) ? s : '';
  const ago = ts => { const m = Math.max(0, Math.floor((Date.now() - Number(ts || 0)) / 60000)); return m < 1 ? 'abhi' : m < 60 ? m + ' min' : Math.floor(m / 60) + ' ghanta'; };
  const fbErr = e => (e && (e.code === 'PERMISSION_DENIED' || /permission/i.test(e.message || ''))) ? 'Permission denied: Firebase rules mein stories wale blocks add karo.' : ((e && e.message) || 'Error aaya.');
  const TS = () => firebase.database.ServerValue.TIMESTAMP;

  // ---------- state ----------
  let me = null, db = null, users = {}, friends = {}, hiddenMap = {}, reports = {};
  let allMap = {}, frMap = {}, seen = {};
  const watchers = new Map(), imgCache = new Map(), purging = new Set(), uiOffs = [];
  let offs = [], V = null, vOffs = [], tickId = 0, rt = 0, toastTimer = 0;
  const sheet = { mode: null, list: null };
  let shOnClose = null;

  const listen = (t, ev, fn) => { if (!t) return; t.addEventListener(ev, fn); uiOffs.push(() => t.removeEventListener(ev, fn)); };

  // ---------- CSS ----------
  const style = el('style');
  style.textContent = `
  .st-strip{display:flex;gap:12px;overflow-x:auto;padding:8px 12px;border-bottom:1px solid var(--line);flex:none;background:#0c1220;scrollbar-width:none}
  .st-strip::-webkit-scrollbar{display:none}.st-strip[hidden]{display:none}
  .st-item{display:flex;flex-direction:column;align-items:center;gap:4px;width:62px;flex:none;cursor:pointer}
  .st-ring{position:relative;width:62px;height:62px;border-radius:50%;padding:3px;display:grid;place-items:center;border:2px solid #3a4766}
  .st-ring.new{border:0;background:linear-gradient(135deg,#6d75ff,#f0788d,#ffd27a);padding:3px}
  .st-ring.seen{border:2px solid #4a5675}.st-ring.none{border:2px dashed #4a5675}
  .st-ring>.st-av{border:2px solid #0c1220}
  .st-plus{position:absolute;right:-3px;bottom:-3px;width:22px;height:22px;border-radius:50%;background:#6d75ff;color:#fff;font-weight:900;display:grid;place-items:center;border:2px solid #0c1220;font-size:15px;line-height:1}
  .st-label{font-size:10px;color:#9ba9c5;max-width:62px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .st-av{border-radius:50%;overflow:hidden;display:grid;place-items:center;flex:none;background:linear-gradient(135deg,#626fff,#a06cff);color:#fff;font-weight:900}
  .st-av img{width:100%;height:100%;object-fit:cover}
  .st-vw{position:fixed;inset:0;z-index:10002;background:#000;display:flex;align-items:center;justify-content:center;color:#fff;font-family:system-ui,sans-serif}
  .st-vw[hidden],.st-comp[hidden],.st-sheetov[hidden],.st-fab[hidden]{display:none}
  .st-img{max-width:100%;max-height:100%;object-fit:contain}
  .st-load{position:absolute;color:#9ba9c5;font-size:14px}
  .st-tap{position:absolute;top:70px;bottom:90px;width:38%;z-index:2}.st-tap.l{left:0}.st-tap.r{right:0}
  .st-bars{position:absolute;top:calc(8px + env(safe-area-inset-top,0px));left:8px;right:8px;display:flex;gap:4px;z-index:3}
  .st-bar{flex:1;height:3px;border-radius:3px;background:#ffffff44;overflow:hidden}.st-bar i{display:block;height:100%;width:0;background:#fff}
  .st-top{position:absolute;top:calc(18px + env(safe-area-inset-top,0px));left:10px;right:10px;display:flex;align-items:center;gap:9px;z-index:4;text-shadow:0 1px 4px #000}
  .st-top b{display:block;font-size:14px}.st-top small{font-size:11px;opacity:.85}
  .st-grow{flex:1;min-width:0}
  .st-ic{background:#00000066;border:0;color:#fff;border-radius:50%;width:36px;height:36px;font-size:16px;cursor:pointer;padding:0}
  .st-cap{position:absolute;left:0;right:0;bottom:84px;padding:12px 16px;text-align:center;font-size:15px;line-height:1.4;background:linear-gradient(transparent,#000a);z-index:3;overflow-wrap:anywhere}
  .st-bottom{position:absolute;left:0;right:0;bottom:0;padding:12px 12px calc(14px + env(safe-area-inset-bottom,0px));display:flex;gap:10px;justify-content:center;z-index:4}
  .st-pill{background:#ffffff22;border:1px solid #ffffff44;color:#fff;border-radius:50px;padding:10px 18px;font-size:15px;font-weight:700;cursor:pointer}
  .st-btn{padding:10px 14px;font-size:13px}.st-btn.secondary{background:#303b50}.st-btn.danger{background:#a83d52}
  .st-sheetov{position:fixed;inset:0;z-index:10004;background:#0008;display:flex;align-items:flex-end;justify-content:center}
  .st-sheetbox{width:min(520px,100%);max-height:78dvh;overflow:auto;background:#151e30;border:1px solid #394866;border-radius:19px 19px 0 0;padding:14px;color:#f1f3ff;font-family:system-ui,sans-serif}
  .st-sh-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}.st-sh-head b{font-size:15px}
  .st-row{display:flex;align-items:center;gap:10px;padding:8px;border-radius:12px;background:#1b263b;margin-top:6px;font-size:13px}
  .st-row b{display:block;font-size:12px}.st-row span.t{overflow-wrap:anywhere}.st-row small{color:#9ba9c5;font-size:10px}
  .st-row .st-btn{padding:6px 9px;font-size:12px}
  .st-cin{flex:1;min-width:0;border:1px solid #394866;background:#0f1726;color:#fff;border-radius:50px;padding:11px 14px;font-size:14px}
  .st-note{font-size:11px;color:#9ba9c5;line-height:1.5;margin:6px 0}
  .st-comp{position:fixed;inset:0;z-index:10003;background:#050812ee;display:flex;align-items:center;justify-content:center;padding:12px}
  .st-compcard{width:min(420px,100%);max-height:92dvh;overflow:auto;background:#151e30;border:1px solid #394866;border-radius:19px;padding:14px;color:#f1f3ff;font-family:system-ui,sans-serif}
  .st-prev{width:100%;max-height:42dvh;object-fit:contain;border-radius:12px;background:#000}
  .st-capin{width:100%;box-sizing:border-box;margin-top:10px;border:1px solid #394866;background:#0f1726;color:#fff;border-radius:12px;padding:10px;font-size:14px;resize:none}
  .st-aud{display:flex;gap:8px;margin:10px 0}.st-chip{flex:1;padding:10px 6px;font-size:13px;background:#303b50}.st-chip.on{background:linear-gradient(135deg,#626fff,#a06cff)}
  .st-act{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}.st-act .st-btn{flex:1}
  .st-msg{min-height:16px;font-size:12px;color:#ffb3c0;margin-top:6px}
  .st-fab{position:fixed;z-index:9996;left:12px;bottom:85px;border:1px solid #f0788d;border-radius:50px;padding:11px 14px;background:#a83d52;color:#fff;font-weight:800;font-size:13px;box-shadow:0 5px 20px #0007;cursor:pointer}
  .st-toast{position:fixed;left:50%;bottom:90px;transform:translateX(-50%) translateY(20px);opacity:0;pointer-events:none;z-index:10006;max-width:90vw;padding:10px 14px;border-radius:14px;background:#26325a;border:1px solid #5766c9;color:#fff;font-size:13px;transition:.25s}
  .st-toast.show{opacity:1;transform:translateX(-50%)}`;
  root.appendChild(style);

  // ---------- shell ----------
  const strip = el('div', 'st-strip'); strip.hidden = true;
  msgsBox.before(strip);
  const vw = el('div', 'st-vw'); vw.hidden = true;
  const bars = el('div', 'st-bars'), top = el('div', 'st-top'), img = el('img', 'st-img'), cap = el('div', 'st-cap');
  const load = el('div', 'st-load'), tapL = el('div', 'st-tap l'), tapR = el('div', 'st-tap r'), bottom = el('div', 'st-bottom');
  vw.append(img, load, tapL, tapR, bars, top, cap, bottom);
  const sh = el('div', 'st-sheetov'); sh.hidden = true;
  const shBox = el('div', 'st-sheetbox'); sh.appendChild(shBox);
  const comp = el('div', 'st-comp'); comp.hidden = true;
  const fab = el('button', 'st-fab', '🚩 Reports'); fab.type = 'button'; fab.hidden = true;
  const toastEl = el('div', 'st-toast');
  const pick = el('input'); pick.type = 'file'; pick.accept = 'image/*'; pick.hidden = true;
  document.body.append(vw, sh, comp, fab, toastEl, pick);

  function toast(t) { toastEl.textContent = t; toastEl.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3500); }

  // ---------- helpers ----------
  const nameOf = uid => (users[uid] && users[uid].username) || 'Member';
  function avatar(uid, size) {
    const a = el('div', 'st-av'); a.style.width = a.style.height = size + 'px'; a.style.fontSize = Math.round(size * 0.42) + 'px';
    const src = safeImg(users[uid] && users[uid].avatar);
    if (src) { const i = document.createElement('img'); i.src = src; i.alt = ''; a.appendChild(i); } else a.textContent = nameOf(uid).slice(0, 1).toUpperCase();
    return a;
  }
  function storiesOf(uid) {
    const out = [], now = Date.now();
    [allMap[uid], frMap[uid]].forEach((m, i) => {
      if (!m) return;
      Object.keys(m).forEach(id => { const s = m[id]; if (s && s.ts && s.ts + DAY > now) out.push({ id, uid, ts: s.ts, caption: s.caption || '', audience: i === 0 ? 'all' : 'friends' }); });
    });
    return out.sort((a, b) => a.ts - b.ts);
  }
  function saveSeen() { try { localStorage.setItem('st_seen_' + me.uid, JSON.stringify(seen)); } catch (_) {} }
  const deleteStory = (author, id) => {
    const up = {};
    ['storiesAll', 'storiesFriends', 'storyImgs', 'storyViews', 'storyLikes', 'storyComments'].forEach(p => { up[p + '/' + author + '/' + id] = null; });
    return db.ref().update(up);
  };
  function toDataURL(file, maxSize, quality) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith('image/')) return reject(new Error('Valid photo choose karo.'));
      const r = new FileReader();
      r.onerror = () => reject(new Error('Photo read nahi hui.'));
      r.onload = () => {
        const im = new Image();
        im.onerror = () => reject(new Error('Photo open nahi hui.'));
        im.onload = () => {
          const sc = Math.min(1, maxSize / Math.max(im.width, im.height));
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(im.width * sc)); c.height = Math.max(1, Math.round(im.height * sc));
          c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', quality));
        };
        im.src = r.result;
      };
      r.readAsDataURL(file);
    });
  }

  // ---------- strip ----------
  function ring(uid, label, state, onTap, plus) {
    const it = el('div', 'st-item'); it.setAttribute('role', 'button');
    const r = el('div', 'st-ring ' + state); r.appendChild(avatar(uid, 52));
    if (plus) { const p = el('span', 'st-plus', '+'); p.addEventListener('click', e => { e.stopPropagation(); openComposer(); }); r.appendChild(p); }
    it.append(r, el('span', 'st-label', label));
    it.addEventListener('click', onTap);
    return it;
  }
  function renderStrip() {
    if (!me) { strip.hidden = true; return; }
    strip.hidden = false;
    const mine = storiesOf(me.uid);
    const items = [ring(me.uid, 'Meri story', mine.length ? (mine.every(s => seen[s.id]) ? 'seen' : 'new') : 'none', () => (mine.length ? openViewer(me.uid) : openComposer()), true)];
    Object.keys(users).filter(u => u !== me.uid).map(u => ({ u, list: storiesOf(u) })).filter(x => x.list.length)
      .map(x => ({ ...x, unseen: x.list.some(s => !seen[s.id]), last: x.list[x.list.length - 1].ts }))
      .sort((a, b) => (b.unseen - a.unseen) || (b.last - a.last))
      .forEach(x => items.push(ring(x.u, nameOf(x.u), x.unseen ? 'new' : 'seen', () => openViewer(x.u))));
    strip.replaceChildren(...items);
  }
  function scheduleRender() { clearTimeout(rt); rt = setTimeout(renderStrip, 200); }

  // ---------- generic bottom sheet ----------
  function openSheet(mode, title, body, onClose) {
    sheet.mode = mode; shOnClose = onClose || null;
    const head = el('div', 'st-sh-head'); head.appendChild(el('b', '', title));
    const x = btn('✕', closeSheet, 'secondary'); head.appendChild(x);
    shBox.replaceChildren(head, body); sh.hidden = false;
  }
  function closeSheet() { if (sh.hidden) return; sh.hidden = true; sheet.mode = null; sheet.list = null; const cb = shOnClose; shOnClose = null; if (cb) cb(); }
  sh.addEventListener('click', e => { if (e.target === sh) closeSheet(); });

  // ---------- viewer ----------
  function openViewer(author) {
    const list = storiesOf(author); if (!list.length) return;
    let idx = list.findIndex(s => !seen[s.id]); if (idx < 0) idx = 0;
    V = { author, list, idx, timer: 0, cur: null, comments: {}, views: {}, likes: {}, liked: false };
    vw.hidden = false; showStory();
  }
  function detachV() { vOffs.forEach(f => { try { f(); } catch (_) {} }); vOffs = []; }
  function closeViewer() { if (V) clearTimeout(V.timer); detachV(); closeSheet(); vw.hidden = true; V = null; renderStrip(); }
  function next() { if (!V) return; if (V.idx + 1 >= V.list.length) { closeViewer(); return; } V.idx++; showStory(); }
  function prev() { if (!V) return; if (V.idx > 0) V.idx--; showStory(); }
  tapR.addEventListener('click', next); tapL.addEventListener('click', prev);

  function loadImg(s) {
    const k = s.uid + '/' + s.id;
    if (imgCache.has(k)) return imgCache.get(k);
    const p = db.ref('storyImgs/' + k).once('value').then(x => safeImg(x.val())).catch(() => '');
    imgCache.set(k, p);
    if (imgCache.size > 30) imgCache.delete(imgCache.keys().next().value);
    return p;
  }
  function startProgress() {
    if (!V) return;
    const f = bars.children[V.idx] && bars.children[V.idx].firstChild;
    if (f) { f.style.transition = 'none'; f.style.width = '0'; void f.offsetWidth; f.style.transition = 'width ' + SLIDE + 'ms linear'; f.style.width = '100%'; }
    clearTimeout(V.timer); V.timer = setTimeout(next, SLIDE);
  }
  function pauseV() { if (V) { clearTimeout(V.timer); const f = bars.children[V.idx] && bars.children[V.idx].firstChild; if (f) f.style.transition = 'none'; } }
  const resumeV = () => { if (V && !vw.hidden) startProgress(); };

  function showStory() {
    clearTimeout(V.timer); detachV(); closeSheet();
    const s = V.list[V.idx]; if (!s) { closeViewer(); return; }
    V.cur = s; V.comments = {}; V.views = {}; V.likes = {}; V.liked = false;
    bars.replaceChildren(...V.list.map((_, i) => { const b = el('div', 'st-bar'); const f = el('i'); f.style.width = i < V.idx ? '100%' : '0'; b.appendChild(f); return b; }));
    const owner = s.uid === me.uid;
    const info = el('div', 'st-grow'); info.append(el('b', '', owner ? 'Meri story' : nameOf(s.uid)), el('small', '', ago(s.ts) + (owner ? (s.audience === 'all' ? ' · 🌍 sab' : ' · 👫 friends') : '')));
    const menu = el('button', 'st-ic', '⋮'); menu.type = 'button'; menu.addEventListener('click', openMenu);
    const close = el('button', 'st-ic', '✕'); close.type = 'button'; close.addEventListener('click', closeViewer);
    top.replaceChildren(avatar(s.uid, 36), info, menu, close);
    cap.textContent = s.caption; cap.hidden = !s.caption;
    img.style.visibility = 'hidden'; load.textContent = 'Loading...'; load.hidden = false;
    loadImg(s).then(src => {
      if (!V || V.cur !== s) return;
      if (!src) { load.textContent = 'Story load nahi hui'; V.timer = setTimeout(next, 2500); return; }
      img.src = src; img.style.visibility = 'visible'; load.hidden = true; startProgress();
    });
    const nx = V.list[V.idx + 1]; if (nx) loadImg(nx);
    seen[s.id] = 1; saveSeen();
    if (!owner) db.ref('storyViews/' + s.uid + '/' + s.id + '/' + me.uid).set(TS()).catch(() => {});
    attachV(s, owner); renderBottom(); scheduleRender();
  }
  function attachV(s, owner) {
    const base = s.uid + '/' + s.id;
    const watch = (path, cb) => { const r = db.ref(path); r.on('value', x => { if (V && V.cur === s) cb(x); }, () => {}); vOffs.push(() => r.off('value')); };
    watch('storyComments/' + base, x => { V.comments = x.val() || {}; renderBottom(); renderCommentList(); });
    if (owner) {
      watch('storyViews/' + base, x => { V.views = x.val() || {}; renderBottom(); });
      watch('storyLikes/' + base, x => { V.likes = x.val() || {}; renderBottom(); });
    } else watch('storyLikes/' + base + '/' + me.uid, x => { V.liked = x.val() === true; renderBottom(); });
  }
  function renderBottom() {
    if (!V || !V.cur) return;
    const owner = V.cur.uid === me.uid, pill = (t, fn) => { const b = el('button', 'st-pill', t); b.type = 'button'; b.addEventListener('click', fn); return b; };
    const items = [];
    if (owner) { items.push(pill('👁 ' + Object.keys(V.views).length, openViewers)); items.push(pill('❤️ ' + Object.keys(V.likes).length, openViewers)); }
    else items.push(pill(V.liked ? '❤️' : '🤍', toggleLike));
    items.push(pill('💬 ' + Object.keys(V.comments).length, openComments));
    bottom.replaceChildren(...items);
  }
  function toggleLike() {
    const s = V.cur, r = db.ref('storyLikes/' + s.uid + '/' + s.id + '/' + me.uid);
    (V.liked ? r.remove() : r.set(true)).catch(e => toast(fbErr(e)));
  }

  // ---------- sheets inside viewer ----------
  function openViewers() {
    pauseV();
    const body = el('div');
    const ids = Array.from(new Set([...Object.keys(V.views), ...Object.keys(V.likes)])).sort((a, b) => (V.views[b] || 0) - (V.views[a] || 0));
    if (!ids.length) body.appendChild(el('div', 'st-note', 'Abhi kisi ne nahi dekha.'));
    ids.forEach(uid => {
      const row = el('div', 'st-row'), g = el('div', 'st-grow');
      g.append(el('b', '', nameOf(uid)), el('small', '', V.views[uid] ? 'Dekha ' + ago(V.views[uid]) + ' pehle' : ''));
      row.append(avatar(uid, 32), g); if (V.likes[uid]) row.appendChild(el('span', '', '❤️'));
      body.appendChild(row);
    });
    openSheet('viewers', '👁 ' + Object.keys(V.views).length + ' views · ❤️ ' + Object.keys(V.likes).length, body, resumeV);
  }
  function openComments() {
    pauseV();
    const body = el('div'), list = el('div'); sheet.list = list;
    const row = el('div', 'st-act'); row.style.flexWrap = 'nowrap';
    const inp = el('input', 'st-cin'); inp.maxLength = MAX_CMT; inp.placeholder = 'Comment likho...';
    const send = btn('Send', async () => {
      const s = V && V.cur, text = inp.value.trim().slice(0, MAX_CMT); if (!s || !text) return;
      inp.value = '';
      try { await db.ref('storyComments/' + s.uid + '/' + s.id).push({ uid: me.uid, user: me.username, text, ts: TS() }); } catch (e) { toast(fbErr(e)); }
    });
    send.style.flex = 'none';
    row.append(inp, send); body.append(list, row);
    openSheet('comments', '💬 Comments', body, resumeV);
    sheet.list = list;
    renderCommentList();
  }
  function renderCommentList() {
    if (sheet.mode !== 'comments' || !sheet.list || !V) return;
    const s = V.cur, items = Object.entries(V.comments).map(([id, c]) => ({ id, ...c })).sort((a, b) => a.ts - b.ts);
    const out = [];
    if (!items.length) out.push(el('div', 'st-note', 'Abhi koi comment nahi. Pehle tum karo 🙂'));
    items.forEach(c => {
      const row = el('div', 'st-row'), g = el('div', 'st-grow');
      g.append(el('b', '', c.user || nameOf(c.uid)), el('span', 't', c.text), el('small', '', ago(c.ts)));
      row.append(avatar(c.uid, 30), g);
      if (c.uid !== me.uid) row.appendChild(btn('🚩', () => report('comment', s, c), 'secondary'));
      if (c.uid === me.uid || s.uid === me.uid || me.uid === ADMIN_UID) {
        row.appendChild(btn('🗑', () => { if (confirm('Ye comment delete karna hai?')) db.ref('storyComments/' + s.uid + '/' + s.id + '/' + c.id).remove().catch(e => toast(fbErr(e))); }, 'danger'));
      }
      out.push(row);
    });
    sheet.list.replaceChildren(...out);
  }
  function openMenu() {
    pauseV();
    const s = V.cur, body = el('div', 'st-act'); body.style.flexDirection = 'column';
    if (s.uid === me.uid) {
      body.append(
        btn('🗑 Ye story delete karo', async () => {
          if (!confirm('Ye story delete karni hai?')) return;
          try { await deleteStory(s.uid, s.id); toast('Story delete ho gayi'); } catch (e) { toast(fbErr(e)); return; }
          shOnClose = null; closeSheet(); V.list.splice(V.idx, 1);
          if (!V.list.length) closeViewer(); else { if (V.idx >= V.list.length) V.idx = V.list.length - 1; showStory(); }
        }, 'danger'),
        btn('🙈 Kisi se chhupao', () => { shOnClose = null; closeSheet(); openHide(resumeV); }, 'secondary'));
    } else {
      body.appendChild(btn('🚩 Story report karo', () => { shOnClose = null; closeSheet(); report('story', s).then(resumeV); }, 'secondary'));
      if (me.uid === ADMIN_UID) body.appendChild(btn('🗑 Delete (admin)', async () => {
        if (!confirm('Admin: ye story delete karni hai?')) return;
        try {
          await deleteStory(s.uid, s.id); shOnClose = null; closeSheet(); V.list.splice(V.idx, 1);
          if (!V.list.length) closeViewer(); else { if (V.idx >= V.list.length) V.idx = V.list.length - 1; showStory(); }
        } catch (e) { toast(fbErr(e)); }
      }, 'danger'));
    }
    openSheet('menu', 'Options', body, resumeV);
  }

  // ---------- hide list ----------
  function openHide(onClose) {
    const body = el('div');
    body.appendChild(el('div', 'st-note', 'Jinko tick karoge unko tumhari nayi aur purani koi bhi story nahi dikhegi.'));
    Object.keys(users).filter(u => u !== me.uid).sort((a, b) => nameOf(a).localeCompare(nameOf(b))).forEach(uid => {
      const row = el('label', 'st-row'), g = el('span', 'st-grow', nameOf(uid));
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!hiddenMap[uid];
      cb.addEventListener('change', () => { db.ref('storyHidden/' + me.uid + '/' + uid).set(cb.checked ? true : null).catch(e => { toast(fbErr(e)); cb.checked = !cb.checked; }); });
      row.append(avatar(uid, 32), g, cb); body.appendChild(row);
    });
    openSheet('hide', '🙈 Inse story chhupao', body, typeof onClose === 'function' ? onClose : null);
  }

  // ---------- report ----------
  async function report(type, s, c) {
    if (!confirm('Admin ko report karna hai?')) return;
    const r = { by: me.uid, byName: me.username, author: s.uid, authorName: nameOf(s.uid), storyId: s.id, type, ts: TS() };
    if (c) { r.cid = c.id; r.text = String(c.text || '').slice(0, 100); r.cuser = c.user || ''; }
    try { await db.ref('storyReports').push(r); toast('Admin ko report bhej di ✅'); } catch (e) { toast(fbErr(e)); }
  }
  function updateFab() {
    const n = Object.keys(reports).length;
    fab.hidden = !(me && me.uid === ADMIN_UID); fab.textContent = '🚩 Reports' + (n ? ' (' + n + ')' : '');
  }
  function openReports() {
    const body = el('div'), ids = Object.keys(reports).sort((a, b) => (reports[b].ts || 0) - (reports[a].ts || 0));
    if (!ids.length) body.appendChild(el('div', 'st-note', 'Koi report nahi 🎉'));
    ids.forEach(rid => {
      const r = reports[rid], row = el('div', 'st-row'), g = el('div', 'st-grow');
      g.append(el('b', '', r.byName + ' ne ' + (r.type === 'comment' ? (r.cuser || 'kisi') + ' ka comment' : r.authorName + ' ki story') + ' report ki'));
      if (r.text) g.appendChild(el('span', 't', '"' + r.text + '"'));
      g.appendChild(el('small', '', ago(r.ts) + ' pehle'));
      const pic = el('img'); pic.style.cssText = 'max-width:100%;max-height:160px;border-radius:8px;margin-top:6px'; pic.hidden = true; g.appendChild(pic);
      const acts = el('div', 'st-act');
      acts.append(
        btn('🖼 Photo', () => { db.ref('storyImgs/' + r.author + '/' + r.storyId).once('value').then(x => { const src = safeImg(x.val()); if (src) { pic.src = src; pic.hidden = false; } else toast('Photo ab nahi hai.'); }).catch(e => toast(fbErr(e))); }, 'secondary'),
        btn('🗑 Delete', async () => {
          if (!confirm('Reported content delete karna hai?')) return;
          try {
            if (r.type === 'comment') await db.ref('storyComments/' + r.author + '/' + r.storyId + '/' + r.cid).remove(); else await deleteStory(r.author, r.storyId);
            await db.ref('storyReports/' + rid).remove();
          } catch (e) { toast(fbErr(e)); }
        }, 'danger'),
        btn('✓ Dismiss', () => db.ref('storyReports/' + rid).remove().catch(e => toast(fbErr(e))), 'secondary'));
      g.appendChild(acts); row.appendChild(g); body.appendChild(row);
    });
    body.appendChild(el('div', 'st-note', 'Mute/ban ke liye purana admin panel use karo.'));
    openSheet('reports', '🚩 Reports', body);
  }
  listen(fab, 'click', openReports);

  // ---------- composer ----------
  function openComposer() { if (me) pick.click(); }
  listen(pick, 'change', async e => {
    const f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f || !me) return;
    try {
      let data = await toDataURL(f, 900, 0.68);
      if (data.length > 430000) data = await toDataURL(f, 720, 0.55);
      if (data.length > 430000) throw new Error('Photo bahut badi hai, koi chhoti photo lo.');
      showComposer(data);
    } catch (err) { toast(err.message || 'Photo nahi chali.'); }
  });
  function showComposer(dataUrl) {
    let aud = 'friends';
    const card = el('div', 'st-compcard'), im = el('img', 'st-prev'); im.src = dataUrl;
    const capIn = el('textarea', 'st-capin'); capIn.rows = 2; capIn.maxLength = MAX_CAP; capIn.placeholder = 'Caption likho...';
    const set = a => { aud = a; aud1.classList.toggle('on', a === 'friends'); aud2.classList.toggle('on', a === 'all'); };
    const aud1 = btn('👫 Sirf friends', () => set('friends'), 'st-chip on'), aud2 = btn('🌍 Sare members', () => set('all'), 'st-chip');
    const audRow = el('div', 'st-aud'); audRow.append(aud1, aud2);
    const msgEl = el('div', 'st-msg');
    const post = btn('Post karo', async () => {
      post.disabled = true; msgEl.style.color = '#9ba9c5'; msgEl.textContent = 'Post ho raha hai...';
      try {
        const id = db.ref('storyImgs/' + me.uid).push().key, meta = { ts: TS() }, c = capIn.value.trim();
        if (c) meta.caption = c.slice(0, MAX_CAP);
        const up = {}; up[(aud === 'all' ? 'storiesAll/' : 'storiesFriends/') + me.uid + '/' + id] = meta; up['storyImgs/' + me.uid + '/' + id] = dataUrl;
        await db.ref().update(up);
        comp.hidden = true; toast('Story laga di ✅');
      } catch (err) { msgEl.style.color = '#ffb3c0'; msgEl.textContent = fbErr(err); post.disabled = false; }
    });
    const act = el('div', 'st-act'); act.append(btn('Cancel', () => { comp.hidden = true; }, 'secondary'), post);
    const hideBtn = btn('🙈 Kisi se chhupao', () => openHide(), 'secondary'); hideBtn.style.width = '100%';
    card.append(im, capIn, audRow, hideBtn, msgEl, act);
    comp.replaceChildren(card); comp.hidden = false;
  }

  // ---------- firebase wiring ----------
  function attach(ref, cb, errCb) { ref.on('value', cb, errCb || (err => console.warn('[Stories]', err && err.message))); offs.push(() => ref.off('value', cb)); }
  function syncWatchers() {
    if (!me) return;
    const want = new Set();
    Object.keys(users).forEach(u => want.add('all/' + u));
    [me.uid, ...Object.keys(friends)].forEach(u => want.add('fr/' + u));
    watchers.forEach((off, k) => { if (!want.has(k)) { off(); watchers.delete(k); const [t, u] = k.split('/'); delete (t === 'all' ? allMap : frMap)[u]; } });
    want.forEach(k => {
      if (watchers.has(k)) return;
      const [t, u] = k.split('/'), map = t === 'all' ? allMap : frMap;
      const ref = db.ref((t === 'all' ? 'storiesAll/' : 'storiesFriends/') + u);
      const cb = s => { map[u] = s.val() || {}; scheduleRender(); };
      ref.on('value', cb, () => { map[u] = {}; });
      watchers.set(k, () => ref.off('value', cb));
    });
    scheduleRender();
  }
  function purgeOwn() {
    if (!me) return;
    [allMap[me.uid], frMap[me.uid]].forEach(m => {
      if (!m) return;
      Object.keys(m).forEach(id => { const s = m[id]; if (s && s.ts && s.ts + DAY <= Date.now() && !purging.has(id)) { purging.add(id); deleteStory(me.uid, id).catch(() => purging.delete(id)); } });
    });
  }
  function tick() { renderStrip(); purgeOwn(); if (V && V.cur && V.cur.ts + DAY <= Date.now()) next(); }

  function start(user) {
    stop();
    if (!user || !window.firebase || !firebase.database) return;
    me = user; db = firebase.database();
    try { seen = JSON.parse(localStorage.getItem('st_seen_' + me.uid) || '{}') || {}; } catch (_) { seen = {}; }
    attach(db.ref('users'), s => { users = s.val() || {}; syncWatchers(); });
    attach(db.ref('friends/' + me.uid), s => { friends = s.val() || {}; syncWatchers(); }, () => {});
    attach(db.ref('storyHidden/' + me.uid), s => { hiddenMap = s.val() || {}; }, () => {});
    if (me.uid === ADMIN_UID) attach(db.ref('storyReports'), s => { reports = s.val() || {}; updateFab(); if (sheet.mode === 'reports') openReports(); }, () => {});
    window.dostoStory = { add: openComposer, openOwn: () => openViewer(me.uid) };
    tickId = setInterval(tick, 60000);
    updateFab(); renderStrip();
  }
  function stop() {
    offs.forEach(f => { try { f(); } catch (_) {} }); offs = [];
    watchers.forEach(off => { try { off(); } catch (_) {} }); watchers.clear();
    clearInterval(tickId); clearTimeout(rt);
    if (V) clearTimeout(V.timer);
    detachV(); V = null;
    vw.hidden = true; sh.hidden = true; comp.hidden = true; fab.hidden = true; strip.hidden = true; sheet.mode = null; shOnClose = null;
    me = null; users = {}; friends = {}; hiddenMap = {}; reports = {}; allMap = {}; frMap = {}; imgCache.clear(); purging.clear();
    delete window.dostoStory;
  }

  if (getUser()) start(getUser());
  const offLogin = on('login', u => start(u));
  const offLogout = on('logout', () => stop());

  return () => {
    offLogin(); offLogout(); stop();
    uiOffs.forEach(f => { try { f(); } catch (_) {} });
    [style, strip, vw, sh, comp, fab, toastEl, pick].forEach(n => n.remove());
  };
}
