/* Dosto ka Chat | Owner / Admin Control Center
   Owner UID is the existing Dibya account. Firebase Realtime Database rules
   must be updated with the supplied database-rules-owner-admin.json.
*/
export default function ({ root, getUser, on }) {
  const OWNER_UID = 'TkdZFaOuM8huIE3I5l6TSWHfHnY2';
  const db = firebase.database();
  const $ = (id, scope = document) => scope === document ? document.getElementById(id) : scope.querySelector('#' + id);
  const el = (tag, cls, value) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (value !== undefined && value !== null) n.textContent = value;
    return n;
  };
  const btn = (label, fn, cls = '') => {
    const b = el('button', 'oa-btn ' + cls, label);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  };
  const esc = s => String(s ?? '');
  const fmt = value => {
    const n = Number(value || 0);
    return n ? new Date(n).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Unknown time';
  };
  const activeBan = value => {
    if (value === true) return { active: true, permanent: true, legacy: true };
    if (!value || value.active !== true) return null;
    if (value.permanent === true || Number(value.until) > Date.now()) return value;
    return null;
  };
  const ts = () => firebase.database.ServerValue.TIMESTAMP;
  const style = el('style');
  style.textContent = `
    #adminPanel{display:none!important}
    .oa-panel,.oa-dialog{position:fixed;inset:0;z-index:10040;background:#050914eF;display:none;align-items:flex-start;justify-content:center;padding:12px;overflow:auto;font:14px system-ui,sans-serif;color:#eef2ff}
    .oa-panel.open,.oa-dialog.open{display:flex}
    .oa-card{width:min(760px,100%);max-height:calc(100dvh - 24px);overflow:auto;background:#121b2c;border:1px solid #3b4d70;border-radius:20px;padding:14px;box-shadow:0 22px 70px #000b;margin:auto}
    .oa-head{display:flex;align-items:center;justify-content:space-between;gap:10px;position:sticky;top:-14px;background:#121b2c;padding:4px 0 12px;z-index:2}
    .oa-head h2{font-size:18px;margin:0}.oa-muted{color:#a5b3cf;font-size:12px;line-height:1.5}.oa-btn{border:1px solid #435577;border-radius:10px;background:#263653;color:#f1f4ff;padding:8px 11px;font-weight:700;font-size:12px;cursor:pointer}.oa-btn:disabled{opacity:.45;cursor:not-allowed}.oa-btn.danger{background:#8d354a;border-color:#b34c63}.oa-btn.good{background:#205b4b;border-color:#39846e}.oa-btn.ghost{background:transparent}.oa-tabs{display:flex;gap:6px;overflow:auto;padding:3px 0 12px;position:sticky;top:36px;background:#121b2c;z-index:2}.oa-tabs button{white-space:nowrap}.oa-tabs button.active{background:#5265bf;border-color:#8493ff}
    .oa-list{display:flex;flex-direction:column;gap:8px}.oa-row{border:1px solid #2d3c59;background:#18243a;border-radius:13px;padding:11px;display:flex;gap:10px;align-items:flex-start;justify-content:space-between}.oa-main{min-width:0;flex:1}.oa-title{font-weight:800;overflow-wrap:anywhere}.oa-meta{font-size:11px;color:#a5b3cf;margin-top:3px;line-height:1.45;overflow-wrap:anywhere}.oa-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;margin-top:8px}.oa-role{display:inline-flex;vertical-align:middle;margin-left:5px;border-radius:999px;padding:2px 7px;font-size:9px;font-weight:900;letter-spacing:.3px;background:#5944a0;color:#fff}.oa-role.admin{background:#245b91}.oa-role.member{background:#34415b}.oa-field{display:flex;flex-direction:column;gap:6px;margin:11px 0}.oa-field label{font-size:12px;color:#b8c5dc;font-weight:700}.oa-field input,.oa-field select,.oa-field textarea{width:100%;padding:11px;border:1px solid #3b4d70;border-radius:11px;background:#0c1423;color:#f2f5ff;font:14px system-ui}.oa-field textarea{min-height:90px;resize:vertical}.oa-note{padding:10px;border:1px solid #415374;background:#1a2a42;border-radius:12px;color:#cbd6ec;font-size:12px;line-height:1.5}.oa-empty{padding:20px;text-align:center;color:#a5b3cf;border:1px dashed #435577;border-radius:12px}.oa-msg{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;color:#d4def1;margin-top:5px}.oa-ban-form .oa-field:first-of-type{margin-top:14px}
    .oa-msg-badge{display:inline-flex;align-items:center;vertical-align:middle;margin-left:5px;padding:1px 6px;border-radius:99px;font-size:9px;line-height:1.5;font-weight:900;letter-spacing:.25px}.oa-msg-badge.owner{background:#6b4bb1;color:#fff}.oa-msg-badge.admin{background:#245b91;color:#fff}
    body.dosto-temp-banned #msgs,body.dosto-temp-banned #bar{display:none!important}
    body.dosto-temp-banned #storiesTab,body.dosto-temp-banned .st-panel,body.dosto-temp-banned .st-vw,body.dosto-temp-banned .st-sheetov,body.dosto-temp-banned .st-comp,body.dosto-temp-banned .st-grid{display:none!important}
    .oa-system-notice{align-self:center;max-width:94%;padding:9px 13px;border:1px solid #8b6a36;background:#382d1c;color:#ffe3a6;border-radius:13px;text-align:center;font-size:12px;white-space:pre-wrap}
    @media(max-width:520px){.oa-row{display:block}.oa-actions{justify-content:flex-start}.oa-card{padding:12px}}
  `;
  document.head.appendChild(style);

  const panel = el('section', 'oa-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.innerHTML = `
    <div class="oa-card">
      <div class="oa-head"><div><h2 id="oaHeading">🛡️ Admin Panel</h2><div class="oa-muted" id="oaSubheading">Moderation and reports</div></div><button class="oa-btn ghost" id="oaClose" type="button">Close</button></div>
      <div class="oa-tabs" id="oaTabs"></div>
      <div id="oaContent"><div class="oa-empty">Panel load ho raha hai...</div></div>
      <div class="oa-muted" id="oaFeedback" role="status" style="margin-top:10px"></div>
    </div>`;
  document.body.appendChild(panel);
  const content = $('oaContent', panel), tabsBox = $('oaTabs', panel), feedback = $('oaFeedback', panel);
  const dialog = el('section', 'oa-dialog');
  dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
  document.body.appendChild(dialog);

  const state = {
    me: null, role: 'member', admins: {}, users: {}, bans: {}, messages: {}, reports: {}, storyReports: {}, actions: {},
    tab: 'members', dmPeer: null, dmChatId: '', listeners: [], staffListeners: [], staffListenersStarted: false
  };
  const stopStaffListeners = () => { state.staffListeners.forEach(off => { try { off(); } catch (_) {} }); state.staffListeners = []; state.staffListenersStarted = false; };
  const stopAll = () => { stopStaffListeners(); state.listeners.forEach(off => { try { off(); } catch (_) {} }); state.listeners = []; };
  const listenRef = (ref, callback, error) => {
    const fn = snap => callback(snap.val() || {});
    ref.on('value', fn, err => { if (error) error(err); else console.warn('[OwnerAdmin]', err); });
    state.listeners.push(() => ref.off('value', fn));
  };
  function note(message, bad = false) {
    feedback.textContent = message || '';
    feedback.style.color = bad ? '#ff9cab' : '#9ce4c7';
  }
  const isOwner = () => !!state.me && state.me.uid === OWNER_UID;
  const isAdmin = () => !!state.me && state.role === 'admin';
  const isStaff = () => isOwner() || isAdmin();
  const nameOf = uid => state.users[uid]?.username || 'Unknown member';
  const roleOf = uid => uid === OWNER_UID ? 'owner' : state.admins[uid] === true ? 'admin' : 'member';
  const banOf = uid => activeBan(state.bans[uid]);
  const addAudit = (action, details = {}) => {
    if (!state.me) return null;
    const key = db.ref('adminActions').push().key;
    return { key, value: {
      action, actorUid: state.me.uid, actorName: state.me.username || nameOf(state.me.uid),
      targetUid: details.targetUid || '', targetName: details.targetName || '',
      reason: details.reason || '', duration: details.duration || '', messageKey: details.messageKey || '',
      reportId: details.reportId || '', ts: ts()
    }};
  };
  function listenStaffRef(ref, callback) {
    const fn = snap => callback(snap.val() || {});
    ref.on('value', fn, err => console.warn('[OwnerAdmin staff listener]', err));
    state.staffListeners.push(() => ref.off('value', fn));
  }
  function startStaffListeners() {
    if (state.staffListenersStarted) return;
    state.staffListenersStarted = true;
    listenStaffRef(db.ref('bans'), v => { state.bans = v; renderTab(); });
    listenStaffRef(db.ref('messages'), v => { state.messages = v; renderTab(); });
    listenStaffRef(db.ref('userReports'), v => { state.reports = v; renderTab(); });
    listenStaffRef(db.ref('storyReports'), v => { state.storyReports = v; renderTab(); });
    if (isOwner()) listenStaffRef(db.ref('adminActions').limitToLast(200), v => { state.actions = v; if (isOwner()) renderTab(); });
  }
  function syncRole() {
    if (!state.me) return;
    state.role = isOwner() ? 'owner' : (state.admins[state.me.uid] === true ? 'admin' : 'member');
    const menuButton = $('menuAdmin');
    if (menuButton) {
      menuButton.textContent = state.role === 'owner' ? '👑 Owner Panel' : '🛡️ Admin Panel';
      menuButton.style.display = isStaff() ? '' : 'none';
    }
    if (!isStaff()) { closePanel(); stopStaffListeners(); }
    else startStaffListeners();
    if (panel.classList.contains('open')) renderTab();
    renderMessageBadges();
  }
  function startFor(user) {
    stopAll();
    state.staffListenersStarted = false;
    state.admins = {}; state.bans = {}; state.messages = {}; state.reports = {}; state.storyReports = {}; state.actions = {};
    state.me = user || null;
    if (!state.me) {
      state.role = 'member'; panel.classList.remove('open');
      document.body.classList.remove('dosto-temp-banned'); return;
    }
    listenRef(db.ref('users'), v => { state.users = v; renderTab(); renderMessageBadges(); scanDmScreens(); });
    listenRef(db.ref('roles/admins'), v => { state.admins = v; syncRole(); });
    const ownBanRef = db.ref('bans/' + state.me.uid);
    const ownBanFn = snap => {
      const b = activeBan(snap.val());
      const temp = !!b && b.permanent !== true;
      document.body.classList.toggle('dosto-temp-banned', temp);
      scanDmScreens();
    };
    ownBanRef.on('value', ownBanFn, () => {});
    state.listeners.push(() => ownBanRef.off('value', ownBanFn));
    syncRole();
    scanDmScreens();
  }
  function openPanel() {
    if (!isStaff()) return;
    $('menuPanel')?.classList.remove('open');
    panel.classList.add('open');
    renderTabs(); renderTab();
  }
  function closePanel() { panel.classList.remove('open'); }
  $('oaClose', panel).addEventListener('click', closePanel);
  panel.addEventListener('click', e => { if (e.target === panel) closePanel(); });
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.classList.remove('open'); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { dialog.classList.remove('open'); closePanel(); } });

  const TABS = () => isOwner()
    ? [['members','👥 Members'],['reports','🚩 Reports'],['messages','🗑 Messages'],['actions','📜 Admin Actions']]
    : [['members','👥 Members'],['reports','🚩 Reports'],['messages','🗑 Messages']];
  function renderTabs() {
    tabsBox.replaceChildren();
    TABS().forEach(([id, label]) => {
      const b = btn(label, () => { state.tab = id; renderTabs(); renderTab(); }, state.tab === id ? 'active' : '');
      if (state.tab === id) b.classList.add('active');
      tabsBox.appendChild(b);
    });
    $('oaHeading', panel).textContent = isOwner() ? '👑 Owner Panel' : '🛡️ Admin Panel';
    $('oaSubheading', panel).textContent = isOwner() ? 'Full control • Admins • Reports • Audit history' : 'Moderation • Temporary bans • Reports';
  }
  function renderTab() {
    if (!panel.classList.contains('open') || !isStaff()) return;
    renderTabs();
    if (state.tab === 'members') renderMembersTab();
    else if (state.tab === 'reports') renderReportsTab();
    else if (state.tab === 'messages') renderMessagesTab();
    else if (state.tab === 'actions' && isOwner()) renderActionsTab();
  }
  function rowShell(title, meta, actions = []) {
    const row = el('article', 'oa-row'); const main = el('div', 'oa-main');
    main.append(el('div', 'oa-title', title));
    if (meta) main.append(el('div', 'oa-meta', meta));
    row.append(main);
    if (actions.length) { const box = el('div', 'oa-actions'); actions.forEach(a => box.append(a)); main.append(box); }
    return row;
  }
  function renderMembersTab() {
    content.replaceChildren();
    const entries = Object.entries(state.users).sort((a,b) => nameOf(a[0]).localeCompare(nameOf(b[0])));
    if (!entries.length) { content.append(el('div','oa-empty','Koi registered member nahi mila.')); return; }
    const list = el('div','oa-list');
    entries.forEach(([uid, profile]) => {
      const role = roleOf(uid), ban = banOf(uid), online = !!document.querySelector('#membersList .member-row');
      const status = ban ? (ban.permanent ? 'Permanent ban' : 'Temporary ban • until ' + fmt(ban.until)) : 'No active ban';
      const actions = [];
      if (isOwner() && uid !== OWNER_UID) {
        actions.push(btn(role === 'admin' ? 'Demote to member' : 'Promote to admin', () => changeRole(uid, role === 'admin' ? 'demote' : 'promote'), role === 'admin' ? 'ghost' : 'good'));
      }
      const canModerate = uid !== OWNER_UID && (isOwner() || isAdmin());
      if (canModerate) {
        if (ban) {
          if (!ban.permanent || isOwner()) actions.push(btn('Unban', () => unban(uid), 'good'));
          if (isOwner() && !ban.permanent) actions.push(btn('Make permanent', () => openBanForm(uid, true), 'danger'));
        } else {
          actions.push(btn('Temporary ban', () => openBanForm(uid, false), 'danger'));
          if (isOwner()) actions.push(btn('Permanent ban', () => openBanForm(uid, true), 'danger'));
        }
      }
      const label = role === 'owner' ? nameOf(uid) + '  👑 OWNER' : role === 'admin' ? nameOf(uid) + '  🛡️ ADMIN' : nameOf(uid);
      const meta = 'UID: ' + uid + ' • ' + status;
      list.append(rowShell(label, meta, actions));
    });
    content.append(list);
  }
  function renderMessagesTab() {
    content.replaceChildren();
    const entries = Object.entries(state.messages).sort((a,b) => Number(b[1]?.ts || 0) - Number(a[1]?.ts || 0)).slice(0,150);
    if (!entries.length) { content.append(el('div','oa-empty','Abhi messages nahi mile.')); return; }
    const list = el('div','oa-list');
    entries.forEach(([key,m]) => {
      if (!m) return;
      const ownerMessage = m.uid === OWNER_UID;
      const allowed = isOwner() || (isAdmin() && !ownerMessage);
      const actions = allowed ? [btn('🗑 Delete message', () => deleteMessage(key,m), 'danger')] : [];
      const title = (m.system ? '📣 System notice' : nameOf(m.uid)) + (ownerMessage ? ' • Owner message' : '');
      const row = rowShell(title, fmt(m.ts) + ' • ' + (m.system ? 'Notice' : 'Message'), actions);
      row.querySelector('.oa-main').append(el('div','oa-msg',m.text || '[No text]'));
      if (!allowed) row.querySelector('.oa-main').append(el('div','oa-meta','Admin owner ka message delete nahi kar sakta.'));
      list.append(row);
    });
    content.append(list);
  }
  function renderReportsTab() {
    content.replaceChildren();
    const heading = el('div','oa-note','DM reports aur story reports yahan milengi. Admin report ko Under Review ya Resolved mark kar sakta hai.');
    content.append(heading);
    const all = [
      ...Object.entries(state.reports).map(([id,v]) => ({id,path:'userReports',v})),
      ...Object.entries(state.storyReports).map(([id,v]) => ({id,path:'storyReports',v}))
    ].sort((a,b) => Number(b.v?.ts || 0) - Number(a.v?.ts || 0));
    if (!all.length) { content.append(el('div','oa-empty','Abhi koi report nahi hai.')); return; }
    const list = el('div','oa-list');
    all.forEach(({id,path,v}) => {
      if (!v) return;
      const status = v.status || 'Pending';
      const target = v.targetName || v.target || nameOf(v.targetUid || v.author || '');
      const who = v.byName || nameOf(v.by || '');
      const title = (path === 'userReports' ? 'DM report: ' : 'Story report: ') + target;
      const meta = 'From ' + who + ' • ' + fmt(v.ts) + ' • ' + status;
      const row = rowShell(title, meta, [
        btn('Under Review', () => setReportStatus(path,id,'Under Review'), status === 'Under Review' ? 'good' : ''),
        btn('Resolved', () => setReportStatus(path,id,'Resolved'), status === 'Resolved' ? 'good' : '')
      ]);
      const main = row.querySelector('.oa-main');
      main.append(el('div','oa-msg','Reason: ' + (v.reason || v.type || 'Not specified') + (v.details ? '\nDetails: ' + v.details : '')));
      if (v.chatId) main.append(el('div','oa-meta','DM Chat ID: ' + v.chatId));
      if (v.messageKey) main.append(el('div','oa-meta','Message reference: ' + v.messageKey));
      list.append(row);
    });
    content.append(list);
  }
  function renderActionsTab() {
    content.replaceChildren();
    if (!isOwner()) return;
    const entries = Object.entries(state.actions).sort((a,b) => Number(b[1]?.ts || 0) - Number(a[1]?.ts || 0)).slice(0,200);
    if (!entries.length) { content.append(el('div','oa-empty','Abhi admin actions record nahi hue.')); return; }
    const list = el('div','oa-list');
    entries.forEach(([id,a]) => {
      if (!a) return;
      const target = a.targetName ? ' • Target: ' + a.targetName : '';
      const reason = a.reason ? '\nReason: ' + a.reason : '';
      const duration = a.duration ? '\nDuration: ' + a.duration : '';
      const row = rowShell(a.action || 'Admin action', (a.actorName || 'Admin') + target + ' • ' + fmt(a.ts));
      row.querySelector('.oa-main').append(el('div','oa-msg',reason + duration + (a.messageKey ? '\nMessage ID: ' + a.messageKey : '')));
      list.append(row);
    });
    content.append(list);
  }
  async function changeRole(uid, action) {
    if (!isOwner() || !uid || uid === OWNER_UID) return;
    const roleRef = db.ref('roles/admins/' + uid);
    const key = db.ref('adminActions').push().key;
    const audit = { action: action === 'promote' ? 'PROMOTE_ADMIN' : 'DEMOTE_ADMIN', actorUid: state.me.uid, actorName: state.me.username || nameOf(state.me.uid), targetUid: uid, targetName: nameOf(uid), ts: ts() };
    try {
      const updates = {};
      updates['roles/admins/' + uid] = action === 'promote' ? true : null;
      updates['adminActions/' + key] = audit;
      await db.ref().update(updates);
      note(action === 'promote' ? nameOf(uid) + ' admin ban gaya.' : nameOf(uid) + ' ko member bana diya.');
    } catch (e) { note('Role update nahi hua: ' + (e.message || e), true); }
  }
  function openBanForm(uid, forcePermanent) {
    if (!isStaff() || !uid || uid === OWNER_UID) return;
    if (isAdmin() && roleOf(uid) === 'owner') return;
    dialog.replaceChildren();
    const card = el('div','oa-card oa-ban-form');
    const head = el('div','oa-head'); head.append(el('h2','',forcePermanent ? '⛔ Permanent ban' : '🚫 Temporary ban'));
    head.append(btn('Close', () => dialog.classList.remove('open'), 'ghost'));
    card.append(head);
    card.append(el('div','oa-note','Ban confirm karne se pehle reason likhna mandatory hai. Ye reason public group chat mein ban notice ke saath dikhega.'));
    const durationWrap = el('div','oa-field');
    durationWrap.append(el('label','','Ban duration'));
    const duration = el('select');
    [['1h','1 hour'],['24h','24 hours'],['3d','3 days'],['7d','7 days'],['custom','Custom duration']].forEach(([v,t]) => { const o=el('option','',t); o.value=v; duration.append(o); });
    if (forcePermanent) duration.value = '24h';
    duration.disabled = forcePermanent;
    durationWrap.append(duration); card.append(durationWrap);
    const customWrap = el('div','oa-field'); customWrap.append(el('label','','Custom hours'));
    const custom = el('input'); custom.type='number'; custom.min='1'; custom.max='2160'; custom.value='48'; customWrap.append(custom); customWrap.hidden=true; card.append(customWrap);
    duration.addEventListener('change', () => customWrap.hidden = duration.value !== 'custom');
    const reasonWrap = el('div','oa-field'); reasonWrap.append(el('label','','Reason (required)'));
    const reason = el('textarea'); reason.maxLength=500; reason.placeholder='Ban ka reason likho...'; reasonWrap.append(reason); card.append(reasonWrap);
    const check = btn(forcePermanent ? 'Confirm permanent ban' : 'Confirm temporary ban', async () => {
      const why = reason.value.trim();
      if (!why) { reason.focus(); reasonWrap.append(el('div','oa-meta','Reason likhna zaroori hai.')); return; }
      let ms = 0, durationText = 'Permanent';
      const choice = forcePermanent ? 'permanent' : duration.value;
      if (choice !== 'permanent') {
        if (choice === '1h') ms=3600000; else if (choice === '24h') ms=86400000; else if (choice === '3d') ms=259200000; else if (choice === '7d') ms=604800000; else {
          const hours=Number(custom.value);
          if (!Number.isFinite(hours) || hours < 1 || hours > 2160) { custom.focus(); customWrap.append(el('div','oa-meta','Custom duration 1 se 2160 hours ke beech honi chahiye.')); return; }
          ms=Math.floor(hours)*3600000;
        }
        if (!ms) { custom.focus(); return; }
        durationText = choice === 'custom' ? (ms/3600000) + ' hours' : duration.options[duration.selectedIndex].text;
      }
      const permanent = choice === 'permanent';
      if (permanent && !isOwner()) return;
      if (!confirm((permanent ? 'Permanently ban ' : 'Temporarily ban ') + nameOf(uid) + '?\nReason: ' + why)) return;
      check.disabled=true; check.textContent='Applying...';
      try { await applyBan(uid, why, permanent, ms, durationText); dialog.classList.remove('open'); }
      catch (e) { note('Ban nahi laga: ' + (e.message || e), true); check.disabled=false; check.textContent='Try again'; }
    },'danger');
    check.disabled=true;
    reason.addEventListener('input', () => { check.disabled = !reason.value.trim(); });
    card.append(check); dialog.append(card); dialog.classList.add('open');
  }
  async function applyBan(uid, reason, permanent, durationMs, durationText) {
    const ban = { active:true, permanent:!!permanent, type:permanent?'permanent':'temporary', until:permanent?0:Date.now()+durationMs, reason, by:state.me.uid, byName:state.me.username || nameOf(state.me.uid), at:ts() };
    const messageKey = db.ref('messages').push().key;
    const log = addAudit(permanent?'PERMANENT_BAN':'TEMPORARY_BAN',{targetUid:uid,targetName:nameOf(uid),reason,duration:durationText});
    const notice = permanent
      ? `⛔ ${nameOf(uid)} ko permanently ban kiya gaya hai.\nReason: ${reason}`
      : `🚨 ${nameOf(uid)} ko group chat aur stories se temporarily ban kiya gaya hai.\nReason: ${reason}\nDuration: ${durationText}`;
    const updates = {};
    updates['bans/' + uid] = ban;
    updates['messages/' + messageKey] = { uid:state.me.uid, user:state.me.username || nameOf(state.me.uid), text:notice, ts:ts(), system:true };
    if (log) updates['adminActions/' + log.key] = log.value;
    await db.ref().update(updates);
    note(nameOf(uid) + ' ban ho gaya. Public chat mein reason ke saath notice post ho gaya.');
    renderTab();
  }
  async function unban(uid) {
    if (!isStaff() || !uid || uid === OWNER_UID) return;
    if (isAdmin() && roleOf(uid) === 'owner') return;
    const existingBan = banOf(uid);
    if (existingBan && existingBan.permanent && !isOwner()) return;
    if (!confirm(nameOf(uid) + ' ka ban remove karna hai?')) return;
    const msgKey = db.ref('messages').push().key;
    const log = addAudit('UNBAN',{targetUid:uid,targetName:nameOf(uid)});
    const updates = {};
    updates['bans/' + uid] = null;
    updates['messages/' + msgKey] = { uid:state.me.uid, user:state.me.username || nameOf(state.me.uid), text:'✅ ' + nameOf(uid) + ' ka ban remove kar diya gaya hai.', ts:ts(), system:true };
    if (log) updates['adminActions/' + log.key] = log.value;
    try { await db.ref().update(updates); note('Ban remove ho gaya.'); }
    catch(e) { note('Unban nahi hua: ' + (e.message || e), true); }
  }
  async function deleteMessage(key, message) {
    if (!isStaff() || !key) return;
    if (!isOwner() && message.uid === OWNER_UID) return;
    if (!confirm('Ye message delete karna hai?')) return;
    const log = addAudit('DELETE_MESSAGE',{targetUid:message.uid,targetName:nameOf(message.uid),messageKey:key});
    const updates = {}; updates['messages/' + key] = null;
    if (log) updates['adminActions/' + log.key] = log.value;
    try { await db.ref().update(updates); note('Message delete ho gaya.'); }
    catch(e) { note('Message delete nahi hua: ' + (e.message || e), true); }
  }
  async function setReportStatus(path, id, status) {
    if (!isStaff()) return;
    const current = path === 'userReports' ? state.reports[id] : state.storyReports[id];
    if (!current) return;
    const updates = {}; updates[path + '/' + id + '/status'] = status; updates[path + '/' + id + '/reviewedBy'] = state.me.uid; updates[path + '/' + id + '/reviewedAt'] = ts();
    const log = addAudit('REPORT_STATUS_' + status.toUpperCase().replace(/\s/g,'_'),{targetUid:current.targetUid || current.author || '',targetName:current.targetName || nameOf(current.targetUid || current.author || ''),reportId:id});
    if (log) updates['adminActions/' + log.key] = log.value;
    try { await db.ref().update(updates); note('Report status: ' + status); }
    catch(e) { note('Report update nahi hua: ' + (e.message || e), true); }
  }

  function openReportForm() {
    if (!state.me) return;
    dialog.replaceChildren();
    const card = el('div','oa-card'); const head=el('div','oa-head');
    head.append(el('h2','','🚩 Report to Owner')); head.append(btn('Close',()=>dialog.classList.remove('open'),'ghost')); card.append(head);
    card.append(el('div','oa-note','Ye report Owner aur admins ko dikhegi. Reason required hai. Galat reports se bacho.'));
    const targetWrap=el('div','oa-field'); targetWrap.append(el('label','','Kis member ke against report hai?'));
    const target=el('select'); const empty=el('option','','Select member'); empty.value=''; target.append(empty);
    Object.entries(state.users).filter(([uid])=>uid!==state.me.uid).sort((a,b)=>nameOf(a[0]).localeCompare(nameOf(b[0]))).forEach(([uid])=>{const o=el('option','',nameOf(uid));o.value=uid;target.append(o);});
    if (state.dmPeer && state.users[state.dmPeer]) target.value=state.dmPeer;
    targetWrap.append(target); card.append(targetWrap);
    const reasonWrap=el('div','oa-field'); reasonWrap.append(el('label','','Reason (required)'));
    const reason=el('textarea'); reason.maxLength=500; reason.placeholder='Report karne ka reason...'; reasonWrap.append(reason); card.append(reasonWrap);
    const detailsWrap=el('div','oa-field'); detailsWrap.append(el('label','','Extra details (optional)'));
    const details=el('textarea'); details.maxLength=1200; details.placeholder='Koi aur detail ya context...'; detailsWrap.append(details); card.append(detailsWrap);
    const submit=btn('Submit report',async()=>{
      const uid=target.value, why=reason.value.trim();
      if(!uid){target.focus();return;} if(!why){reason.focus();return;}
      submit.disabled=true; submit.textContent='Submitting...';
      const key=db.ref('userReports').push().key;
      const peer=state.users[uid]||{};
      const value={by:state.me.uid,byName:state.me.username||nameOf(state.me.uid),targetUid:uid,targetName:peer.username||nameOf(uid),reason:why,details:details.value.trim(),chatId:state.dmChatId||'',ts:ts(),status:'Pending'};
      try { await db.ref('userReports/'+key).set(value); dialog.classList.remove('open'); note('Report Owner aur admins ko bhej di gayi.'); }
      catch(e){note('Report submit nahi hui: '+(e.message||e),true);submit.disabled=false;submit.textContent='Try again';}
    },'danger'); submit.disabled=true; reason.addEventListener('input',()=>{submit.disabled=!reason.value.trim()||!target.value;}); target.addEventListener('change',()=>{submit.disabled=!reason.value.trim()||!target.value;});
    card.append(submit); dialog.append(card); dialog.classList.add('open');
  }
  function roleBadge(uid) {
    const role=roleOf(uid); if(role==='member') return null;
    const b=el('span','oa-msg-badge '+role,role==='owner'?'👑 OWNER':'🛡️ ADMIN'); return b;
  }
  function renderMessageBadges() {
    document.querySelectorAll('.dm-msg[data-uid],.dm-message[data-uid],[data-message-uid]').forEach(article=>{
      if(article.closest('#msgs')) return; // Group chat badges are rendered by index-owner-admin.html.
      const uid=article.dataset.uid||article.dataset.messageUid; const name=article.querySelector('b,.dm-sender,.dm-name,.message-user');
      if(!uid||!name)return;
      const role=roleOf(uid), existing=name.querySelector('.oa-msg-badge');
      if(existing && existing.dataset.role===role) return;
      if(existing) existing.remove();
      const badge=roleBadge(uid); if(badge){badge.dataset.role=role;name.append(badge);}
    });
  }
  function parsePeer(container) {
    if(!container)return null;
    const selectors=['[data-peer-uid]','[data-user-uid]','[data-target-uid]','[data-uid]','[data-chat-id]'];
    const nodes=[container,...container.querySelectorAll(selectors.join(','))];
    for(const n of nodes){
      for(const attr of ['data-peer-uid','data-user-uid','data-target-uid']){const v=n.getAttribute?.(attr);if(v&&state.users[v]&&v!==state.me?.uid)return v;}
      const chat=n.getAttribute?.('data-chat-id');
      if(chat){const parts=chat.split(/[_-]/);const p=parts.find(x=>x!==state.me?.uid&&state.users[x]);if(p)return p;}
      const uid=n.getAttribute?.('data-uid');if(uid&&uid!==state.me?.uid&&state.users[uid])return uid;
    }
    const title=container.querySelector('[data-username],.dm-title,.dm-name,.chat-title,.conversation-title');
    const label=title?.getAttribute('data-username')||title?.textContent?.trim();
    if(label){const hit=Object.entries(state.users).find(([uid,p])=>uid!==state.me?.uid&&String(p.username||'').toLowerCase()===label.toLowerCase());if(hit)return hit[0];}
    return null;
  }
  function scanDmScreens() {
    if(!state.me || activePermanentBanSafe()) return;
    const all=[...document.querySelectorAll('[id],[class],[data-chat-id]')];
    const candidates=all.filter(n=>{
      if(!(n instanceof HTMLElement)||n===panel||n===dialog||!n.getClientRects().length)return false;
      const tag=((n.id||'')+' '+(typeof n.className==='string'?n.className:'')).toLowerCase();
      if(!/(^|[\s_-])dm($|[\s_-])|^dm|dm[-_]|direct|inbox|private.?chat|conversation/.test(tag))return false;
      if(!n.querySelector('input,textarea,[contenteditable="true"]'))return false;
      if(n.closest('.oa-panel,.oa-dialog'))return false;
      return true;
    });
    if(!candidates.length){state.dmPeer=null;state.dmChatId='';return;}
    const target=candidates.sort((a,b)=>a.querySelectorAll('*').length-b.querySelectorAll('*').length)[0];
    state.dmPeer=parsePeer(target);
    state.dmChatId=target.getAttribute('data-chat-id')||target.id||'';
    const header=target.querySelector('.dm-header,.dm-head,.chat-header,.conversation-header,header')||target;
    if(!header.querySelector('.oa-inline-report')){
      const r=btn('🚩 Report to Owner',()=>openReportForm(),'oa-inline-report');
      r.style.margin='6px'; header.append(r);
    }
  }
  function activeBanSafe(){const own=activeBan(state.bans[state.me?.uid]);return !!own && own.permanent!==true;}
  function activePermanentBanSafe(){const own=activeBan(state.bans[state.me?.uid]);return !!own && own.permanent===true;}
  const menuAdmin=$('menuAdmin');
  if(menuAdmin)menuAdmin.addEventListener('click',e=>{
    if(!isStaff())return;
    e.preventDefault();e.stopImmediatePropagation();openPanel();
  },true);

  // Public ban notices are styled as centered system cards; main chat sets data-uid
  // on each message so owner/admin badges can be attached without trusting names.
  const msgObserver=new MutationObserver(()=>{renderMessageBadges();scanDmScreens();});
  msgObserver.observe(document.body,{childList:true,subtree:true});

  if (typeof on === 'function') {
    on('login', user => startFor(user || getUser()));
    on('logout', () => startFor(null));
  }
  const initialUser=getUser(); if(initialUser)startFor(initialUser);

  return () => {
    stopAll(); msgObserver.disconnect(); panel.remove(); dialog.remove(); style.remove();
  };
}
