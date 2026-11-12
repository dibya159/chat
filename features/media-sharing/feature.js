/* Dosto ka Chat - Media Sharing (Photos Max 5MB + GIFs + Delete) */
export default function ({ getUser, on }) {
  const $ = id => document.getElementById(id);
  const app = $('app'), bar = $('bar'), msgsBox = $('msgs');
  if (!app || !bar || !msgsBox) return;

  const ADMIN_UID = 'TkdZFaOuM8huIE3I5l6TSWHfHnY2';
  const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB max
  const ALLOWED_IMG = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const GIPHY_KEY_STORAGE = 'dosto_giphy_api_key_v1';

  let me = null, db = null, users = {}, groupMsgs = [];
  let activeSendHandler = null;
  let storagePromise = null;
  const offs = [], uiOffs = [];

  const el = (tag, cls, txt) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  };
  const listen = (t, ev, fn) => {
    if (!t) return;
    t.addEventListener(ev, fn);
    uiOffs.push(() => t.removeEventListener(ev, fn));
  };
  const safeUrl = u => (typeof u === 'string' && /^https:\/\//i.test(u)) ? u : '';

  // ---------- Role / Delete Permissions ----------
  function isAdminOrOwner() {
    if (!me) return false;
    if (me.uid === ADMIN_UID || me.isAdmin) return true;
    const u = users[me.uid] || {};
    return u.role === 'owner' || u.role === 'admin' || u.isAdmin === true || u.isOwner === true;
  }
  function canDeleteMedia(senderUid) {
    return !!(me && (senderUid === me.uid || isAdminOrOwner()));
  }

  // ---------- Dynamic Firebase Storage Loader ----------
  function getStorageWithBucket(bucketName) {
    const b = bucketName || (firebase.app().options || {}).storageBucket || 'chatappdibya.firebasestorage.app';
    return firebase.app().storage(b.startsWith('gs://') ? b : 'gs://' + b);
  }
  function ensureStorage(bucketName) {
    if (window.firebase && typeof firebase.storage === 'function') {
      return Promise.resolve(getStorageWithBucket(bucketName));
    }
    if (storagePromise) return storagePromise.then(() => getStorageWithBucket(bucketName));
    storagePromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage-compat.js';
      s.onload = () => {
        if (typeof firebase.storage !== 'function') reject(new Error('Storage SDK load nahi hua.'));
        else resolve(getStorageWithBucket(bucketName));
      };
      s.onerror = () => reject(new Error('Firebase Storage SDK load nahi ho paya.'));
      document.head.appendChild(s);
    });
    return storagePromise;
  }

  // ---------- Styles ----------
  const style = el('style');
  style.textContent = `
  .ms-plus{width:40px;height:40px;flex:none;padding:0;border-radius:50%;background:#202b42;border:1px solid #34415e;color:#f1f3ff;font-size:22px;line-height:1;display:grid;place-items:center}
  .ms-plus:active{transform:scale(.94)}
  .ms-sheet{position:absolute;left:10px;right:10px;bottom:70px;z-index:25;background:#151e30;border:1px solid #394866;border-radius:18px;padding:12px;box-shadow:0 16px 45px #000b}
  .ms-sheet[hidden]{display:none}
  .ms-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .ms-opt{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;padding:14px 10px;border-radius:14px;background:#1a2438;border:1px solid #2b3852;color:#f1f3ff;font-weight:700;font-size:14px}
  .ms-opt small{font-size:10px;color:#55d9a0;font-weight:600}
  .ms-media{display:block;max-width:230px;max-height:260px;width:100%;border-radius:11px;margin-top:6px;object-fit:cover;background:#0c1220;cursor:pointer}
  .ms-del{position:absolute;right:6px;top:6px;padding:3px 6px;font-size:10px;border-radius:8px;background:#a83d52;color:#fff;z-index:2}
  .ms-modal{position:fixed;inset:0;z-index:10060;background:#050812e6;display:flex;align-items:center;justify-content:center;padding:14px}
  .ms-modal[hidden]{display:none}
  .ms-card{width:min(440px,100%);max-height:85dvh;display:flex;flex-direction:column;gap:10px;background:#151e30;border:1px solid #394866;border-radius:18px;padding:14px}
  .ms-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
  .ms-head b{font-size:16px}
  .ms-gifs{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;overflow-y:auto;max-height:46dvh}
  .ms-gifs img{width:100%;height:120px;object-fit:cover;border-radius:10px;cursor:pointer;background:#0c1220}
  .ms-toast{position:fixed;left:50%;bottom:84px;transform:translateX(-50%);background:#222c45;color:#fff;padding:9px 14px;border-radius:12px;font-size:13px;z-index:10070;display:none;max-width:90vw;text-align:center}
  .ms-toast.show{display:block}
  .ms-light{position:fixed;inset:0;z-index:10080;background:#000e;display:flex;align-items:center;justify-content:center;padding:16px}
  .ms-light[hidden]{display:none}
  .ms-light img{max-width:100%;max-height:90dvh;border-radius:12px}`;
  document.head.appendChild(style);

  // ---------- Toast & Lightbox ----------
  const toastEl = el('div', 'ms-toast');
  document.body.appendChild(toastEl);
  let toastT = 0;
  const toast = t => {
    toastEl.textContent = t;
    toastEl.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove('show'), 4000);
  };

  const lightbox = el('div', 'ms-light');
  lightbox.hidden = true;
  const lightImg = el('img');
  lightbox.appendChild(lightImg);
  listen(lightbox, 'click', () => { lightbox.hidden = true; lightImg.src = ''; });
  document.body.appendChild(lightbox);

  // ---------- Upload Sheet (Photos + GIFs) ----------
  const sheet = el('div', 'ms-sheet');
  sheet.hidden = true;
  const grid = el('div', 'ms-grid');

  const fileInput = el('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/jpeg,image/png,image/webp,image/gif';
  fileInput.hidden = true;

  const photoBtn = el('button', 'ms-opt');
  photoBtn.type = 'button';
  photoBtn.append(el('span', '', '🖼️ Photos'), el('small', '', 'Max 5 MB'));

  const gifBtn = el('button', 'ms-opt');
  gifBtn.type = 'button';
  gifBtn.append(el('span', '', '🎞️ GIFs'), el('small', '', 'Search / Link / File'));

  grid.append(photoBtn, gifBtn);
  sheet.append(grid, fileInput);
  app.appendChild(sheet);

  // ---------- GIF Picker Modal ----------
  const gifModal = el('div', 'ms-modal');
  gifModal.hidden = true;
  const gifCard = el('div', 'ms-card');
  const gifHead = el('div', 'ms-head');
  const gifClose = el('button', 'secondary', 'Close');
  gifClose.type = 'button';
  gifHead.append(el('b', '', '🎞️ GIF Bhejo'), gifClose);

  const gifSearchIn = el('input');
  gifSearchIn.placeholder = 'GIF search karo (e.g. funny, hi, party)...';
  const gifResults = el('div', 'ms-gifs');

  const gifUrlIn = el('input');
  gifUrlIn.placeholder = 'Ya direct .gif link paste karo (https://...)';
  const gifUrlSend = el('button', '', 'Link se GIF Bhejo');
  gifUrlSend.type = 'button';

  const gifKeyIn = el('input');
  gifKeyIn.placeholder = 'GIPHY API Key (optional, ek baar save karein)';
  gifKeyIn.value = localStorage.getItem(GIPHY_KEY_STORAGE) || '';

  gifCard.append(gifHead, gifSearchIn, gifResults, gifUrlIn, gifUrlSend, gifKeyIn);
  gifModal.appendChild(gifCard);
  document.body.appendChild(gifModal);

  listen(gifClose, 'click', () => { gifModal.hidden = true; });
  listen(gifKeyIn, 'change', () => {
    localStorage.setItem(GIPHY_KEY_STORAGE, gifKeyIn.value.trim());
    toast('GIPHY API key save ho gayi!');
  });

  let searchTimer = 0;
  async function loadGifs(query) {
    const key = (gifKeyIn.value || '').trim();
    if (!key) {
      gifResults.replaceChildren(el('div', '', 'Live GIF search ke liye apni free GIPHY API key niche paste karein, ya upar direct GIF link daalein.'));
      return;
    }
    gifResults.replaceChildren(el('div', '', 'GIFs load ho rahe hain...'));
    try {
      const endpoint = query
        ? `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(key)}&q=${encodeURIComponent(query)}&limit=16&rating=pg-13`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${encodeURIComponent(key)}&limit=16&rating=pg-13`;
      const res = await fetch(endpoint);
      const data = await res.json();
      const items = (data && data.data) || [];
      if (!items.length) {
        gifResults.replaceChildren(el('div', '', 'Koi GIF nahi mila.'));
        return;
      }
      gifResults.replaceChildren();
      items.forEach(item => {
        const url = item.images && (item.images.fixed_width?.url || item.images.original?.url);
        if (!safeUrl(url)) return;
        const img = el('img');
        img.src = url;
        img.alt = item.title || 'GIF';
        img.loading = 'lazy';
        img.addEventListener('click', async () => {
          gifModal.hidden = true;
          if (activeSendHandler) await activeSendHandler({ mediaUrl: url, mediaType: 'gif', storagePath: '' });
        });
        gifResults.appendChild(img);
      });
    } catch {
      gifResults.replaceChildren(el('div', '', 'GIF load karne me error aaya.'));
    }
  }

  listen(gifSearchIn, 'input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadGifs(gifSearchIn.value.trim()), 400);
  });

  listen(gifUrlSend, 'click', async () => {
    const u = safeUrl(gifUrlIn.value.trim());
    if (!u) { toast('Valid https:// GIF link daalo.'); return; }
    gifUrlIn.value = '';
    gifModal.hidden = true;
    if (activeSendHandler) await activeSendHandler({ mediaUrl: u, mediaType: 'gif', storagePath: '' });
  });

  // ---------- Photo Upload Handler (Max 5 MB) ----------
  listen(photoBtn, 'click', () => { sheet.hidden = true; fileInput.click(); });
  listen(gifBtn, 'click', () => { sheet.hidden = true; gifModal.hidden = false; loadGifs(''); });

  listen(fileInput, 'change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file || !me) return;
    if (!ALLOWED_IMG.includes(file.type)) {
      toast('Sirf JPG, PNG, WebP ya GIF file bhej sakte ho.');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      toast('❌ Photo 5 MB se badi hai! Max limit 5 MB hai.');
      return;
    }
    try {
      toast('Uploading...');
      const ext = (file.name.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 6) || 'jpg';
      const path = `chatMedia/${me.uid}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
      let ref;
      try {
        const s1 = await ensureStorage('chatappdibya.firebasestorage.app');
        ref = s1.ref(path);
        await ref.put(file, { contentType: file.type });
      } catch {
        const s2 = await ensureStorage('chatappdibya.appspot.com');
        ref = s2.ref(path);
        await ref.put(file, { contentType: file.type });
      }
      const url = await ref.getDownloadURL();
      const mediaType = file.type === 'image/gif' ? 'gif' : 'image';
      if (activeSendHandler) await activeSendHandler({ mediaUrl: url, mediaType, storagePath: path });
      toast('Sent!');
    } catch (e) {
      toast('Upload fail: ' + (e.message || 'Firebase Storage enable/rules check karein.'));
    }
  });

  // ---------- Attach Left "+" Button to Any Message Bar ----------
  function attachPlusToBar(targetBar, sendFn) {
    if (!targetBar || targetBar.querySelector('.ms-plus')) return;
    const plus = el('button', 'ms-plus', '+');
    plus.type = 'button';
    plus.title = 'Photo ya GIF bhejo';
    plus.addEventListener('click', e => {
      e.stopPropagation();
      activeSendHandler = sendFn;
      sheet.hidden = !sheet.hidden;
    });
    targetBar.prepend(plus);
  }

  // Group Chat Send Handler
  async function sendGroupMedia({ mediaUrl, mediaType, storagePath }) {
    if (!me || !db) return;
    await db.ref('messages').push({
      uid: me.uid,
      user: me.username,
      text: mediaType === 'gif' ? '🎞️ GIF' : '📷 Photo',
      mediaUrl,
      mediaType,
      storagePath: storagePath || '',
      ts: firebase.database.ServerValue.TIMESTAMP
    });
  }

  attachPlusToBar(bar, sendGroupMedia);
  listen(document, 'click', e => {
    if (!sheet.hidden && !sheet.contains(e.target) && !e.target.closest('.ms-plus')) {
      sheet.hidden = true;
    }
  });

  // ---------- Delete Media Helper (RTDB + Storage) ----------
  function deleteFromStorage(storagePath) {
    if (!storagePath) return;
    ensureStorage('chatappdibya.firebasestorage.app')
      .then(s => s.ref(storagePath).delete())
      .catch(() => ensureStorage('chatappdibya.appspot.com').then(s => s.ref(storagePath).delete()).catch(() => {}));
  }

  async function deleteMediaMessage(refPath, storagePath) {
    if (!db) return;
    if (!confirm('Kya aap ye media delete karna chahte hain?')) return;
    try {
      await db.ref(refPath).remove();
      deleteFromStorage(storagePath);
      toast('Media delete ho gaya.');
    } catch (e) {
      toast('Delete nahi ho paya: ' + (e.message || 'Permission denied'));
    }
  }

  // ---------- Enhance Group Chat Bubbles ----------
  function decorateGroupMessages() {
    const rows = msgsBox.querySelectorAll('.msg-row');
    rows.forEach((row, idx) => {
      const m = groupMsgs[idx];
      if (!m || !m.mediaUrl || row.dataset.msDone === m.key) return;
      row.dataset.msDone = m.key;
      const bubble = row.querySelector('.msg');
      if (!bubble) return;

      const url = safeUrl(m.mediaUrl);
      if (!url) return;

      if (m.mediaType === 'video') {
        const vid = el('video', 'ms-media');
        vid.src = url;
        vid.controls = true;
        vid.playsInline = true;
        bubble.appendChild(vid);
      } else {
        const img = el('img', 'ms-media');
        img.src = url;
        img.alt = m.mediaType === 'gif' ? 'GIF' : 'Photo';
        img.loading = 'lazy';
        img.addEventListener('click', () => {
          lightImg.src = url;
          lightbox.hidden = false;
        });
        bubble.appendChild(img);
      }

      if (canDeleteMedia(m.uid) && !bubble.querySelector('.ms-del')) {
        const del = el('button', 'ms-del', '🗑️');
        del.type = 'button';
        del.title = 'Delete media';
        del.addEventListener('click', e => {
          e.stopPropagation();
          deleteMediaMessage('messages/' + m.key, m.storagePath);
        });
        bubble.appendChild(del);
      }
    });
  }

  const msgObserver = new MutationObserver(() => decorateGroupMessages());
  msgObserver.observe(msgsBox, { childList: true });

  // ---------- Public Hook for DM Module ----------
  window.DostoMedia = {
    attachBar: attachPlusToBar,
    canDelete: canDeleteMedia,
    openLightbox: url => { if (safeUrl(url)) { lightImg.src = url; lightbox.hidden = false; } },
    deleteStorage: deleteFromStorage
  };

  // ---------- Lifecycle ----------
  function start(user) {
    if (!user || !window.firebase) return;
    me = user;
    db = firebase.database();

    const uRef = db.ref('users');
    const uCb = s => { users = s.val() || {}; decorateGroupMessages(); };
    uRef.on('value', uCb);
    offs.push(() => uRef.off('value', uCb));

    const mRef = db.ref('messages').limitToLast(100);
    const mCb = s => {
      const list = [];
      s.forEach(c => { const v = c.val(); if (v && v.text) list.push({ key: c.key, ...v }); });
      groupMsgs = list;
      decorateGroupMessages();
    };
    mRef.on('value', mCb);
    offs.push(() => mRef.off('value', mCb));
  }

  function stop() {
    me = null;
    db = null;
    groupMsgs = [];
    offs.forEach(f => f());
    offs.length = 0;
    sheet.hidden = true;
    gifModal.hidden = true;
  }

  if (getUser()) start(getUser());
  const offIn = on('login', u => start(u));
  const offOut = on('logout', () => stop());

  return () => {
    offIn(); offOut(); stop();
    msgObserver.disconnect();
    uiOffs.forEach(f => f());
    document.querySelectorAll('.ms-plus').forEach(b => b.remove());
    style.remove(); sheet.remove(); gifModal.remove(); toastEl.remove(); lightbox.remove();
    delete window.DostoMedia;
  };
}
