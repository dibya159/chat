/* Dosto ka Chat - Leaderboard feature v1.0
   Read-only stats derived from existing users + recent messages.
   No XP is written to Firebase, so users cannot self-award points.
*/
export default function ({ root, getUser, on }) {
  const style = document.createElement('style');
  style.textContent = `
  .lb-wrap{color:#edf2ff;background:linear-gradient(145deg,#141d31,#101522 65%,#19132c);border:1px solid #33415f;border-radius:18px;padding:14px;box-shadow:0 12px 32px #0005;font-family:system-ui,sans-serif}
  .lb-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}.lb-kicker{font-size:10px;letter-spacing:2px;color:#9eb4ff;font-weight:800}.lb-head h2{margin:3px 0 0;font-size:21px}.lb-live{font-size:10px;color:#72e3ad;background:#173629;padding:5px 8px;border-radius:99px}
  .lb-tabs,.lb-periods{display:flex;gap:7px;overflow:auto;padding:12px 0 5px}.lb-tabs button,.lb-periods button{white-space:nowrap;border:1px solid #35435e;background:#1a2438;color:#cbd6ee;border-radius:10px;padding:8px 11px;font-size:12px;font-weight:700}.lb-tabs button.active,.lb-periods button.active{background:#596fe8;color:#fff;border-color:#8292ff}
  .lb-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:10px 0}.lb-stat{background:#1a2438;border:1px solid #2b3a56;border-radius:12px;padding:10px}.lb-stat b{display:block;font-size:18px}.lb-stat span{font-size:10px;color:#aab8d4}
  .lb-podium{display:grid;grid-template-columns:1fr 1.15fr 1fr;gap:7px;align-items:end;margin:12px 0}.lb-pod{min-width:0;text-align:center;padding:11px 5px;border-radius:14px;background:#202b40;border:1px solid #40506c}.lb-pod.first{padding-top:17px;padding-bottom:17px;background:linear-gradient(160deg,#55451e,#29253b);border-color:#b99548}.lb-avatar{width:34px;height:34px;margin:0 auto 5px;border-radius:50%;display:grid;place-items:center;background:#34466b;font-weight:900}.lb-pod.first .lb-avatar{width:42px;height:42px;background:#80642a}.lb-pod strong{display:block;font-size:12px;overflow-wrap:anywhere}.lb-pod small{font-size:10px;color:#c3cde2}.lb-pod .medal{font-size:19px}
  .lb-list{display:flex;flex-direction:column;gap:7px}.lb-row{display:grid;grid-template-columns:30px minmax(0,1fr) auto;align-items:center;gap:9px;background:#192338;border:1px solid #2a3955;border-radius:12px;padding:9px}.lb-row.mine{border-color:#778cff;background:#202b49}.lb-rank{font-weight:900;color:#9eafd2;text-align:center}.lb-person{min-width:0}.lb-person b{display:block;font-size:13px;overflow-wrap:anywhere}.lb-person small{display:block;color:#9eacc8;font-size:10px}.lb-score{text-align:right;font-weight:850;font-size:13px}.lb-score small{display:block;color:#9eacc8;font-size:9px;font-weight:500}
  .lb-panel{background:#192338;border:1px solid #2a3955;border-radius:13px;padding:12px;margin-top:9px}.lb-panel h3{margin:0 0 9px;font-size:14px}.lb-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.lb-badge{background:#202d46;border-radius:10px;padding:9px;font-size:11px}.lb-badge b{display:block;font-size:12px;margin-bottom:3px}.lb-muted{color:#9eacc8;font-size:11px;line-height:1.5}.lb-progress{height:7px;background:#303d57;border-radius:99px;overflow:hidden;margin:7px 0}.lb-progress i{display:block;height:100%;background:linear-gradient(90deg,#5b7cff,#a17cff);border-radius:99px}.lb-empty{text-align:center;padding:20px 8px;color:#aab8d4;font-size:12px}.lb-foot{font-size:10px;color:#8594b2;margin-top:10px;line-height:1.5}.lb-error{color:#ff9aa5}
  @media(min-width:650px){.lb-wrap{padding:18px}.lb-list{display:grid;grid-template-columns:1fr 1fr}.lb-podium{max-width:560px;margin:14px auto}.lb-summary{max-width:560px}}
  `;
  root.appendChild(style);

  const wrap = document.createElement('div');
  wrap.className = 'lb-wrap';
  wrap.innerHTML = `
    <div class="lb-head"><div><div class="lb-kicker">DOSTO KA CHAT • COMPETITION HUB</div><h2>🏆 Leaderboard</h2></div><span class="lb-live" id="lbLive">● Connecting</span></div>
    <div class="lb-tabs" role="tablist">
      <button class="active" data-tab="rank">🏆 Rankings</button><button data-tab="challenges">⚔️ Challenges</button><button data-tab="badges">🎖️ Achievements</button><button data-tab="stats">👤 My Stats</button><button data-tab="hall">👑 Hall of Fame</button>
    </div>
    <div id="lbContent"><div class="lb-empty">Leaderboard load ho raha hai...</div></div>
    <div class="lb-foot">Stats existing chat messages aur member profiles se calculate hote hain. XP yahan display points hain, purchasable ya transferable nahi.</div>`;
  root.appendChild(wrap);

  const content = wrap.querySelector('#lbContent');
  const live = wrap.querySelector('#lbLive');
  let users = {}, messages = [], activeTab = 'rank', period = 'all', current = getUser();
  let stopMessages = null, stopUsers = null;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const nameFor = uid => users[uid]?.username || users[uid]?.displayName || 'Member';
  const now = Date.now();
  const startOfDay = d => { const x = new Date(d); x.setHours(0,0,0,0); return x.getTime(); };
  const weekStart = d => { const x = new Date(d); x.setHours(0,0,0,0); x.setDate(x.getDate() - ((x.getDay()+6)%7)); return x.getTime(); };
  const getStats = () => {
    const byUid = {};
    Object.keys(users).forEach(uid => byUid[uid] = {uid, username:nameFor(uid), total:0, today:0, week:0, days:new Set(), last:0});
    messages.forEach(m => {
      if (!m || !m.uid || !byUid[m.uid] || m.system || typeof m.text !== 'string') return;
      const ts = Number(m.ts || 0); if (!ts) return;
      const s = byUid[m.uid]; s.total++; s.last = Math.max(s.last,ts);
      if (ts >= startOfDay(now)) s.today++;
      if (ts >= weekStart(now)) s.week++;
      s.days.add(new Date(ts).toDateString());
    });
    return Object.values(byUid).map(s => ({...s, activeDays:s.days.size, xp:s.total, level:Math.max(1,Math.floor(s.total/25)+1), next:((Math.floor(s.total/25)+1)*25), streak:s.activeDays}));
  };
  const getRows = () => {
    const list = getStats();
    const key = period === 'day' ? 'today' : period === 'week' ? 'week' : 'total';
    return list.sort((a,b) => b[key]-a[key] || b.total-a.total || a.username.localeCompare(b.username)).map((s,i)=>({...s,rank:i+1,score:s[key]}));
  };
  const medal = n => n===1?'🥇':n===2?'🥈':n===3?'🥉':'#'+n;
  const podiumHTML = rows => {
    if (!rows.length) return '';
    const order = [rows[1],rows[0],rows[2]].filter(Boolean);
    return `<div class="lb-podium">${order.map(s=>`<div class="lb-pod ${s.rank===1?'first':''}"><div class="medal">${medal(s.rank)}</div><div class="lb-avatar">${esc(s.username.slice(0,1).toUpperCase())}</div><strong>${esc(s.username)}</strong><small>${s.score} pts</small></div>`).join('')}</div>`;
  };
  const rowsHTML = rows => rows.map(s=>`<div class="lb-row ${current?.uid===s.uid?'mine':''}"><div class="lb-rank">${medal(s.rank)}</div><div class="lb-person"><b>${esc(s.username)} ${current?.uid===s.uid?'(You)':''}</b><small>Level ${s.level} • ${s.total} messages • ${s.activeDays} active days</small></div><div class="lb-score">${s.score}<small>POINTS</small></div></div>`).join('');
  const periodButtons = () => `<div class="lb-periods"><button data-period="day" class="${period==='day'?'active':''}">Today</button><button data-period="week" class="${period==='week'?'active':''}">This Week</button><button data-period="all" class="${period==='all'?'active':''}">All Time</button></div>`;

  function renderRank() {
    const rows = getRows();
    const me = rows.find(x=>x.uid===current?.uid);
    const totalMsgs = messages.filter(m=>m && !m.system && typeof m.text==='string').length;
    content.innerHTML = `${periodButtons()}<div class="lb-summary"><div class="lb-stat"><b>${rows.length}</b><span>Members</span></div><div class="lb-stat"><b>${totalMsgs}</b><span>Messages counted</span></div><div class="lb-stat"><b>${me?'#'+me.rank:'-'}</b><span>Your Rank</span></div></div>${podiumHTML(rows.slice(0,3))}<div class="lb-list">${rows.length?rowsHTML(rows):'<div class="lb-empty">Abhi ranking ke liye data nahi hai.</div>'}</div>`;
  }
  function renderChallenges() {
    const me = getStats().find(x=>x.uid===current?.uid) || {total:0,today:0,week:0,activeDays:0};
    const challenges = [
      ['💬 First Steps','10 messages bhejo',me.total,10],['⚡ Chat Regular','50 messages complete karo',me.total,50],['🔥 Century Club','100 messages complete karo',me.total,100],['📅 Daily Visitor','Aaj 5 messages bhejo',me.today,5],['🏅 Weekly Grinder','Is week 25 messages bhejo',me.week,25],['🌟 Active Friend','5 alag din chat mein active raho',me.activeDays,5]
    ];
    content.innerHTML = `<div class="lb-panel"><h3>⚔️ Your Challenges</h3><p class="lb-muted">Har challenge complete karne par badge unlock hota hai. Progress recent chat activity se calculate hoti hai.</p>${challenges.map(c=>`<div class="lb-badge"><b>${c[0]}</b><span class="lb-muted">${c[1]} • ${Math.min(c[2],c[3])}/${c[3]}</span><div class="lb-progress"><i style="width:${Math.min(100,c[2]/c[3]*100)}%"></i></div></div>`).join('')}</div>`;
  }
  function renderBadges() {
    const me = getStats().find(x=>x.uid===current?.uid) || {total:0,today:0,week:0,activeDays:0};
    const badges = [['💬 First Message','1 message',me.total>=1],['🗣️ Talkative','25 messages',me.total>=25],['💯 Century','100 messages',me.total>=100],['🔥 Daily Spark','5 messages today',me.today>=5],['📆 Weekly Warrior','25 messages this week',me.week>=25],['🌟 Familiar Face','5 active days',me.activeDays>=5],['👑 Chat Legend','500 messages',me.total>=500],['💎 Elite Member','1000 messages',me.total>=1000]];
    content.innerHTML = `<div class="lb-panel"><h3>🎖️ Achievements</h3><div class="lb-grid">${badges.map(b=>`<div class="lb-badge" style="opacity:${b[2]?1:.48}"><b>${b[0]} ${b[2]?'✓':'🔒'}</b><span class="lb-muted">${b[1]}${b[2]?' • Unlocked':' • Locked'}</span></div>`).join('')}</div></div>`;
  }
  function renderStats() {
    const me = getStats().find(x=>x.uid===current?.uid);
    if (!me) { content.innerHTML='<div class="lb-empty">Apna profile stats dekhne ke liye login karo.</div>'; return; }
    const progress = me.total % 25;
    const rows = getRows(); const rank = rows.find(x=>x.uid===me.uid)?.rank || '-';
    content.innerHTML = `<div class="lb-panel"><h3>👤 ${esc(me.username)} • My Stats</h3><div class="lb-summary"><div class="lb-stat"><b>#${rank}</b><span>Overall Rank</span></div><div class="lb-stat"><b>${me.xp}</b><span>XP Points</span></div><div class="lb-stat"><b>${me.level}</b><span>Level</span></div><div class="lb-stat"><b>${me.total}</b><span>Messages</span></div><div class="lb-stat"><b>${me.activeDays}</b><span>Active Days</span></div><div class="lb-stat"><b>${me.today}</b><span>Today</span></div></div><p class="lb-muted">Next level: ${me.next} messages</p><div class="lb-progress"><i style="width:${progress/25*100}%"></i></div><p class="lb-muted">${progress}/25 progress to next level</p></div>`;
  }
  function renderHall() {
    const rows = getRows().filter(x=>x.week>0).sort((a,b)=>b.week-a.week);
    content.innerHTML = `<div class="lb-panel"><h3>👑 Hall of Fame</h3><p class="lb-muted">Current week ke top performers. Weekly winner yahan is week ke data ke basis par dikh raha hai.</p>${rows.length?rows.slice(0,10).map((s,i)=>`<div class="lb-row"><div class="lb-rank">${medal(i+1)}</div><div class="lb-person"><b>${esc(s.username)}</b><small>Weekly Champion race</small></div><div class="lb-score">${s.week}<small>THIS WEEK</small></div></div>`).join(''):'<div class="lb-empty">Is week abhi koi message activity nahi.</div>'}</div>`;
  }
  function render() {
    if (!current) { content.innerHTML='<div class="lb-empty">Login karke leaderboard dekho.</div>'; return; }
    if (activeTab==='rank') renderRank();
    else if (activeTab==='challenges') renderChallenges();
    else if (activeTab==='badges') renderBadges();
    else if (activeTab==='stats') renderStats();
    else renderHall();
  }
  wrap.querySelectorAll('[data-tab]').forEach(btn=>btn.addEventListener('click',()=>{
    activeTab=btn.dataset.tab; wrap.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b===btn)); render();
  }));
  wrap.addEventListener('click',e=>{
    const btn=e.target.closest('[data-period]'); if(!btn) return;
    period=btn.dataset.period; render();
  });

  function connect() {
    if (!window.firebase?.database || !getUser()) { live.textContent='● Login required'; return; }
    try {
      const db = firebase.database();
      if (stopMessages) db.ref('messages').off('value',stopMessages);
      if (stopUsers) db.ref('users').off('value',stopUsers);
      const messageRef = db.ref('messages').limitToLast(1500);
      stopMessages = snap => { messages=[]; snap.forEach(child=>{const v=child.val(); if(v) messages.push(v);}); live.textContent='● Live'; render(); };
      stopUsers = snap => { users=snap.val() || {}; render(); };
      messageRef.on('value',stopMessages,err=>{live.textContent='● Data blocked';content.innerHTML='<div class="lb-empty lb-error">Messages read nahi ho paaye. Firebase Rules check karo.</div>';console.warn('[Leaderboard]',err);});
      db.ref('users').on('value',stopUsers,err=>{live.textContent='● Data blocked';console.warn('[Leaderboard]',err);});
    } catch(err) { live.textContent='● Error'; console.error('[Leaderboard]',err); }
  }
  connect();
  const stopLogin=on('login',user=>{current=user;connect();render();});
  const stopLogout=on('logout',()=>{current=null;users={};messages=[];live.textContent='● Offline';render();});
  return ()=>{
    try { const db=window.firebase?.database?.(); if(db){if(stopMessages)db.ref('messages').off('value',stopMessages);if(stopUsers)db.ref('users').off('value',stopUsers);} } catch(_) {}
    stopLogin(); stopLogout(); style.remove(); wrap.remove();
  };
}
