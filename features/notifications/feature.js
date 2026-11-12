/* Dosto ka Chat - Standalone Notification & Unread Badge System v2.0
   Works 100% automatically with Firebase without touching existing files.
*/
export default function initNotifications({ root, getUser, on }) {
  // Hide the empty feature container so it doesn't clutter the page
  if (root) root.style.display = 'none';

  // 1. Inject Styles for Unread Red Dots / Counter Badges & Permission Prompt
  const style = document.createElement('style');
  style.textContent = `
    .dosto-badge-host { position: relative !important; }
    .dosto-unread-pill {
      position: absolute;
      top: -5px;
      right: -5px;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      border-radius: 999px;
      background: #ef4444;
      color: #fff;
      font: 800 10px/18px system-ui, sans-serif;
      text-align: center;
      box-shadow: 0 0 10px rgba(239, 68, 68, 0.75);
      border: 2px solid #090d1a;
      pointer-events: none;
      z-index: 60;
      display: none;
    }
    .dosto-unread-pill.show { display: inline-block; }
    .dosto-unread-pill.dot {
      min-width: 10px;
      width: 10px;
      height: 10px;
      padding: 0;
      top: -2px;
      right: -2px;
    }
    .dosto-perm-toast {
      position: fixed;
      left: 50%;
      bottom: 72px;
      transform: translateX(-50%);
      z-index: 9999;
      background: rgba(14, 19, 38, 0.96);
      color: #eef2ff;
      border: 1px solid rgba(110, 231, 255, 0.3);
      border-radius: 999px;
      padding: 8px 14px;
      display: flex;
      align-items: center;
      gap: 10px;
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5);
      font: 700 12px system-ui, sans-serif;
      backdrop-filter: blur(12px);
      white-space: nowrap;
    }
    .dosto-perm-toast button {
      border: 0;
      border-radius: 999px;
      padding: 6px 12px;
      background: linear-gradient(135deg, #2563eb, #06b6d4);
      color: #fff;
      font: 800 11px system-ui, sans-serif;
      cursor: pointer;
    }
  `;
  document.head.appendChild(style);

  // 2. Built-in Notification Chime (No external MP3 required)
  let audioCtx = null;
  function playChime() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume();

      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now);       // D5
      osc.frequency.setValueAtTime(880.00, now + 0.08); // A5

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.32);
    } catch (_) {}
  }

  // 3. Push Notification (Works both Inside & Outside App + Service Worker)
  function pushAlert(title, body, tag = 'dosto-alert') {
    playChime();

    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const options = {
      body: String(body || ''),
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: tag + '-' + Date.now(),
      renotify: true
    };

    if (navigator.serviceWorker) {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg && reg.showNotification) {
          reg.showNotification(title, options).catch(() => {
            try { new Notification(title, options); } catch (_) {}
          });
        } else {
          try { new Notification(title, options); } catch (_) {}
        }
      }).catch(() => {
        try { new Notification(title, options); } catch (_) {}
      });
    } else {
      try {
        const n = new Notification(title, options);
        n.onclick = () => { window.focus(); n.close(); };
      } catch (_) {}
    }
  }

  // Expose global helper for manual testing if ever needed
  window.DostoNotify = {
    notify: (title = 'Test Alert 🔔', body = 'Notification ekdam mast kaam kar raha hai boss!') => {
      pushAlert(title, body, 'test');
    }
  };

  function askNotificationPermission() {
    if (!('Notification' in window)) return;
    if (document.querySelector('.dosto-perm-toast')) return;

    if (Notification.permission === 'default') {
      const toast = document.createElement('div');
      toast.className = 'dosto-perm-toast';
      toast.innerHTML = `
        <span>🔔 मैसेज अलर्ट पाने के लिए Allow करें</span>
        <button type="button">Allow</button>
      `;
      toast.querySelector('button').onclick = async () => {
        try {
          const perm = await Notification.requestPermission();
          if (perm === 'granted') {
            pushAlert('Dosto ka Chat 🔔', 'Notifications chalu ho gaye boss!', 'welcome');
          }
        } catch (_) {}
        toast.remove();
      };
      document.body.appendChild(toast);
    }
  }

  // 4. Unread Badge Manager (Automatically attaches to DM Launcher, Bell & Stories)
  const counts = { dm: 0, bell: 0, stories: 0 };

  function getTargetElement(kind) {
    if (kind === 'dm') {
      return document.querySelector('.dm-launcher') || document.querySelector('[data-feature="dm"]');
    }
    if (kind === 'bell') {
      return document.querySelector('#notifBell, #notificationBell, .notif-bell, [data-tab="requests"]');
    }
    if (kind === 'stories') {
      return document.querySelector('[data-feature="stories"] .bridge-title, [data-feature="stories"]');
    }
    return null;
  }

  function renderBadge(kind) {
    const el = getTargetElement(kind);
    if (!el) return;
    el.classList.add('dosto-badge-host');

    let pill = el.querySelector(`.dosto-unread-pill[data-kind="${kind}"]`);
    if (!pill) {
      pill = document.createElement('span');
      pill.className = 'dosto-unread-pill';
      pill.dataset.kind = kind;
      el.appendChild(pill);
      el.addEventListener('click', () => setBadge(kind, 0));
    }

    const val = counts[kind] || 0;
    if (val > 0) {
      if (kind === 'stories') {
        pill.classList.add('dot');
        pill.textContent = '';
      } else {
        pill.classList.remove('dot');
        pill.textContent = val > 99 ? '99+' : String(val);
      }
      pill.classList.add('show');
    } else {
      pill.classList.remove('show');
    }
  }

  function setBadge(kind, val) {
    counts[kind] = Math.max(0, val);
    renderBadge(kind);
  }

  function addBadge(kind, delta = 1) {
    setBadge(kind, (counts[kind] || 0) + delta);
  }

  // 5. Direct Firebase Listeners (Matches your exact Firebase database structure)
  let offs = [];
  let threadOffs = new Map();

  function clearListeners() {
    offs.forEach(fn => { try { fn(); } catch (_) {} });
    offs = [];
    threadOffs.forEach(fn => { try { fn(); } catch (_) {} });
    threadOffs.clear();
  }

  function listenRef(ref, event, cb) {
    ref.on(event, cb);
    offs.push(() => ref.off(event, cb));
  }

  function startFirebaseWatch() {
    clearListeners();
    const me = getUser && getUser();
    if (!me || !me.uid || !window.firebase || !window.firebase.database) return;

    const db = window.firebase.database();
    const pairId = (a, b) => [String(a), String(b)].sort().join('__');

    // A) Main Public Group Chat Messages (Ignore existing initial snapshot, alert on every new one)
    const chatRef = db.ref('messages').limitToLast(1);
    let chatReady = false;
    chatRef.once('value', () => { chatReady = true; });
    listenRef(chatRef, 'child_added', snap => {
      if (!chatReady) return;
      const m = snap.val();
      if (!m) return;
      const senderUid = m.uid || m.senderUid || m.userId;
      if (senderUid === me.uid) return; // Ignore own message

      const sender = m.username || m.name || m.user || 'Dost';
      const text = m.text || m.message || (m.voice ? '🎤 Voice message' : '💬 New message');
      pushAlert(`${sender} (Group Chat)`, text, 'group-chat');
    });

    // B) Incoming Friend / DM Requests (dmRequests/{myUid})
    const reqRef = db.ref('dmRequests/' + me.uid);
    let knownReqs = null;
    listenRef(reqRef, 'value', snap => {
      const val = snap.val() || {};
      const keys = Object.keys(val);
      setBadge('bell', keys.length);

      if (knownReqs !== null) {
        keys.forEach(uid => {
          if (!knownReqs.has(uid)) {
            const req = val[uid] || {};
            const name = req.fromName || req.username || 'किसी दोस्त';
            addBadge('dm', 1);
            pushAlert('🔔 New DM Request', `${name} ने आपको DM रिक्वेस्ट भेजी है!`, 'dm-req-' + uid);
          }
        });
      }
      knownReqs = new Set(keys);
    });

    // C) Friends List -> Watch Private DM Threads
    const friendsRef = db.ref('dmFriends/' + me.uid);
    listenRef(friendsRef, 'value', snap => {
      const friends = snap.val() || {};
      Object.keys(friends).forEach(friendUid => {
        if (threadOffs.has(friendUid)) return;

        const pid = pairId(me.uid, friendUid);
        const msgRef = db.ref('dmThreads/' + pid + '/messages').limitToLast(1);
        let dmReady = false;
        msgRef.once('value', () => { dmReady = true; });

        const onDm = msgRef.on('child_added', mSnap => {
          if (!dmReady) return;
          const m = mSnap.val();
          if (!m || m.uid === me.uid) return;

          const sender = m.name || friends[friendUid]?.name || 'Dost';
          const text = m.unsent ? 'Message unsent' : (m.text || (m.voice ? '🎤 Voice message' : '💬 Private message'));
          addBadge('dm', 1);
          pushAlert(`💬 ${sender}`, text, 'dm-' + pid);
        });

        threadOffs.set(friendUid, () => msgRef.off('child_added', onDm));
      });
    });

    // D) Online Presence Alert ("Friend is online now")
    const presRef = db.ref('presence');
    const onlineState = new Map();
    let presBooted = false;
    listenRef(presRef, 'value', snap => {
      const all = snap.val() || {};
      Object.entries(all).forEach(([uid, data]) => {
        if (uid === me.uid || !data) return;
        const isOnline = !!(data.online || data.state === 'online');
        const wasOnline = onlineState.get(uid);
        if (presBooted && isOnline && !wasOnline) {
          const name = data.username || data.name || 'आपका दोस्त';
          pushAlert('🟢 Online Now', `${name} अभी ऑनलाइन आया है!`, 'pres-' + uid);
        }
        onlineState.set(uid, isOnline);
      });
      presBooted = true;
    });

    // E) New Stories Added
    const storiesRef = db.ref('stories').limitToLast(1);
    let storiesReady = false;
    storiesRef.once('value', () => { storiesReady = true; });
    listenRef(storiesRef, 'child_added', snap => {
      if (!storiesReady) return;
      const st = snap.val();
      if (!st || st.uid === me.uid) return;

      const author = st.username || st.name || 'Dost';
      addBadge('stories', 1);
      pushAlert('📸 New Story', `${author} ने नई स्टोरी लगाई है!`, 'story-new');
    });
  }

  // Boot & Login hooks
  askNotificationPermission();
  setTimeout(startFirebaseWatch, 900);

  const offLogin = on ? on('login', () => setTimeout(startFirebaseWatch, 500)) : () => {};
  const offLogout = on ? on('logout', clearListeners) : () => {};

  return () => {
    offLogin();
    offLogout();
    clearListeners();
    style.remove();
  };
}
