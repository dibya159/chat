/* Dosto ka Chat - Games (v2)
   Games: Try Your Luck, Bet Game, Calculation.
   Modes: Single Player, Multiplayer (room code, 1v1 / 2v2 / 4v4, kick), Challenge Someone (username, popup, 15s).
   Points + Leaderboard titles (Legend/Ultimate/Pro) + game badges (hide kar sakte ho).
   index.html ko chhedna nahi padta. */
export default function ({ root, getUser, on }) {
  const $ = id => document.getElementById(id);
  const app = $('app'), nav = $('bottomNav');
  if (!app || !nav) throw new Error('Games: index.html ke elements nahi mile.');
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const btn = (label, fn, cls) => { const b = el('button', cls || '', label); b.type = 'button'; b.addEventListener('click', fn); return b; };
  const safeImg = s => typeof s === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(s) ? s : '';
  const fbErr = e => (e && (e.code === 'PERMISSION_DENIED' || /permission/i.test(e.message || ''))) ? 'Permission denied: Firebase rules mein game wale blocks add karo.' : ((e && e.message) || 'Error aaya.');
  const TS = () => firebase.database.ServerValue.TIMESTAMP;
  const rand = n => Math.floor(Math.random() * n);

  // ---------- config ----------
  const GAMES = {
    luck: { name: 'Try Your Luck', icon: '🎯', rules: '9 box hain: 2 sahi, 7 galat. 3 round, har round mein 1 box chuno. 2 ya zyada sahi = Win, 3 sahi = 2x reward!' },
    bet: { name: 'Bet Game', icon: '🪙', rules: 'Coin flip: Head ya Tail guess karo aur bet lagao. Sahi = +bet, galat = -bet.' },
    calc: { name: 'Calculation', icon: '🧮', rules: 'Sawal ka jawab time ke andar do. Single: 10 sec (aasan). Challenge/Room: 30 sec (mushkil), jo pehle sahi bataye wo jeete.' }
  };
  const START_PTS = 100, MAX_STAKE = 500, MAX_BET = 100, CHALLENGE_MS = 15000, COOL_MS = 60000;
  const D = { luckWin: 20, luckPerfect: 40, luckLoss: -10, calcWin: 15, calcLoss: -5, leave: -5 };
  const BADGES = { luck: '🍀 Luck Master', bet: '🪙 Bet King', calc: '🧮 Math Genius' };
  const TITLES = ['👑 Legend', '💎 Ultimate', '⭐ Pro'];
  const SIZES = ['1v1', '2v2', '4v4'];

  // ---------- state ----------
  let me = null, db = null, users = {}, scores = {}, cool = {}, invites = {}, offset = 0, offs = [], roomOffs = [];
  let sel = null, screen = 'games', local = null, roomId = null, room = null, appliedFor = null, firstSnap = true, resolveReady = null, firstInv = true;
  let ticker = 0, timeoutSent = null, inviteSentAt = 0, modalEnd = 0, modalId = null, pickSide = null, pickBet = 10, multiSize = '1v1', msg = '', toastT = 0;
  const uiOffs = [];
  const listen = (t, ev, fn, o) => { if (!t) return; t.addEventListener(ev, fn, o); uiOffs.push(() => t.removeEventListener(ev, fn, o)); };
  const attach = (ref, ev, cb, bag) => { ref.on(ev, cb, () => {}); (bag || offs).push(() => ref.off(ev, cb)); };
  const now = () => Date.now() + offset;
  const nameOf = uid => (users[uid] && (users[uid].chatName || users[uid].username)) || 'Member';
  const pointsOf = uid => (scores[uid] && scores[uid].points != null) ? Number(scores[uid].points) || 0 : START_PTS;
  const cur = () => local || room;

  // ---------- pure game logic ----------
  function newG(game, competitive) {
    if (game === 'luck') {
      const two = () => { const a = rand(9); let b = rand(9); while (b === a) b = rand(9); return a + ',' + b; };
      return { boxes: { r1: two(), r2: two(), r3: two() }, picks: {} };
    }
    if (game === 'bet') return { picks: {}, flip: null };
    let a, b, q, ans, secs;
    if (competitive) { a = 11 + rand(89); b = 11 + rand(89); q = a + ' × ' + b; ans = a * b; secs = 30; }
    else { a = 10 + rand(90); b = 10 + rand(90); q = a + ' + ' + b; ans = a + b; secs = 10; }
    return { q, ans, answers: {}, ends: now() + secs * 1000, secs };
  }
  const active = r => Object.keys(r.players || {}).filter(u => !r.players[u].left);
  function luckHits(r, uid) {
    const pk = (r.g.picks && r.g.picks[uid]) || {}; let n = 0;
    for (let k = 1; k <= 3; k++) {
      const bx = String((r.g.boxes || {})['r' + k] || '').split(',').map(Number);
      if (pk['r' + k] != null && bx.includes(Number(pk['r' + k]))) n++;
    }
    return n;
  }
  function calcOk(r, uid) { const a = (r.g.answers || {})[uid]; return !!(a && Number(a.a) === r.g.ans && Number(a.t) <= r.g.ends + 1500); }
  function outcomes(r) {
    const ps = r.players || {}, uids = Object.keys(ps), solo = r.mode === 'single', chal = r.mode === 'challenge', st = Number(r.stake) || 0, out = {};
    const put = (u, res, d, x) => { out[u] = Object.assign({ res, d }, x || {}); };
    const teamPlay = (score, winD, lossD, extra) => { // score: {uid: n}
      const ts = { A: 0, B: 0 }; uids.forEach(u => { ts[ps[u].team] += score[u] || 0; });
      const win = ts.A === ts.B ? null : (ts.A > ts.B ? 'A' : 'B');
      uids.forEach(u => {
        const res = !win ? 'draw' : (ps[u].team === win ? 'win' : 'loss');
        put(u, res, res === 'win' ? (chal ? st : winD(u)) : res === 'loss' ? (chal ? -st : lossD) : 0, Object.assign({ team: ts }, extra ? extra(u) : {}));
      });
    };
    if (r.game === 'luck') {
      const hits = {}; uids.forEach(u => { hits[u] = luckHits(r, u); });
      if (solo) { const u = uids[0], h = hits[u]; put(u, h >= 2 ? 'win' : 'loss', h === 3 ? D.luckPerfect : h === 2 ? D.luckWin : D.luckLoss, { hits: h }); }
      else teamPlay(hits, u => hits[u] === 3 ? D.luckPerfect : D.luckWin, D.luckLoss, u => ({ hits: hits[u] }));
    } else if (r.game === 'bet') {
      const flip = r.g.flip, pk = u => (r.g.picks || {})[u] || {};
      if (chal) {
        const ok = {}; uids.forEach(u => { ok[u] = pk(u).side === flip; });
        const same = uids.every(u => ok[u] === ok[uids[0]]);
        uids.forEach(u => { const res = same ? 'draw' : (ok[u] ? 'win' : 'loss'); put(u, res, res === 'win' ? st : res === 'loss' ? -st : 0, { flip }); });
      } else uids.forEach(u => { const win = pk(u).side === flip, b = Number(pk(u).bet) || 0; put(u, win ? 'win' : 'loss', win ? b : -b, { flip }); });
    } else {
      const ans = r.g.answers || {};
      if (solo) { const u = uids[0], ok = calcOk(r, u); put(u, ok ? 'win' : 'loss', ok ? D.calcWin : D.calcLoss, { correct: r.g.ans }); }
      else {
        let first = null, ft = Infinity;
        uids.forEach(u => { if (calcOk(r, u) && Number(ans[u].t) < ft) { ft = Number(ans[u].t); first = u; } });
        if (!first) uids.forEach(u => put(u, 'draw', 0, { correct: r.g.ans }));
        else { const wt = ps[first].team; uids.forEach(u => { const res = ps[u].team === wt ? 'win' : 'loss'; put(u, res, res === 'win' ? (chal ? st : D.calcWin) : (chal ? -st : D.calcLoss), { correct: r.g.ans, first }); }); }
      }
    }
    // jo room chhod gaya: loss (challenge mein opponent ko win)
    const left = uids.filter(u => ps[u].left);
    if (left.length && !solo) {
      uids.forEach(u => {
        if (ps[u].left) put(u, 'loss', chal ? -st : D.leave, { left: true });
        else if (chal) put(u, 'win', st, { oppLeft: true });
      });
    }
    return out;
  }
  function finalize(r) {
    if (r.game === 'bet' && !r.g.flip) r.g.flip = Math.random() < 0.5 ? 'h' : 't';
    r.out = outcomes(r); r.status = 'done';
  }
  function checkDone(r) {
    const a = active(r); if (!a.length) return;
    const pk = r.g.picks || {}, ans = r.g.answers || {};
    if (r.game === 'luck') { if (a.every(u => { const p = pk[u] || {}; return p.r1 != null && p.r2 != null && p.r3 != null; })) finalize(r); }
    else if (r.game === 'bet') { if (a.every(u => (pk[u] || {}).side)) finalize(r); }
    else if (a.some(u => ans[u] && Number(ans[u].a) === r.g.ans) || a.every(u => ans[u])) finalize(r);
  }

  // ---------- scores / titles / badges ----------
  function lbData() {
    return Object.keys(scores).filter(u => Number(scores[u].plays) > 0).map(u => ({ uid: u, name: nameOf(u), points: pointsOf(u), wins: Number(scores[u].wins) || 0, losses: Number(scores[u].losses) || 0, plays: Number(scores[u].plays) || 0 }))
      .sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name)).map((r, i) => ({ ...r, rank: i + 1 }));
  }
  const titleOf = uid => { const r = lbData().find(x => x.uid === uid); return r && r.rank <= 3 ? TITLES[r.rank - 1] : ''; };
  function holders() {
    const h = {};
    Object.keys(GAMES).forEach(g => {
      let best = null, bw = 0;
      Object.keys(scores).forEach(u => {
        const w = Number(scores[u].by && scores[u].by[g] && scores[u].by[g].wins) || 0;
        if (w > bw || (w === bw && w > 0 && best && pointsOf(u) > pointsOf(best))) { bw = w; best = u; }
      });
      if (best) h[g] = best;
    });
    return h;
  }
  const badgesOf = uid => { if (scores[uid] && scores[uid].hideBadges) return []; const h = holders(); return Object.keys(h).filter(g => h[g] === uid).map(g => BADGES[g]); };
  const medal = n => n === 1 ? '🥇' : n === 2 ? '🥈' : n === 3 ? '🥉' : '#' + n;
  function applyOutcome(game, res, d) {
    if (!me || !db) return;
    db.ref('gameScores/' + me.uid).transaction(c => {
      c = c || { points: START_PTS, plays: 0, wins: 0, losses: 0, by: {} };
      c.points = Math.max(0, (c.points != null ? Number(c.points) : START_PTS) + d);
      c.plays = (c.plays || 0) + 1; if (res === 'win') c.wins = (c.wins || 0) + 1; else if (res === 'loss') c.losses = (c.losses || 0) + 1;
      c.by = c.by || {}; const g = c.by[game] = c.by[game] || { plays: 0, wins: 0 }; g.plays = (g.plays || 0) + 1; if (res === 'win') g.wins = (g.wins || 0) + 1;
      return c;
    }).catch(e => toast(fbErr(e)));
  }
  function applyOnce(r) {
    const key = local ? 'L' + local.ts : roomId;
    if (appliedFor === key) return; appliedFor = key;
    const o = r.out && r.out[me.uid]; if (!o || (r.applied && r.applied[me.uid])) return;
    applyOutcome(r.game, o.res, o.d);
    if (!local) roomRef(roomId).child('applied/' + me.uid).set(true).catch(() => {});
  }

  // ---------- styles + shell ----------
  const style = el('style');
  style.textContent = `
  .gm-panel{position:absolute;left:0;right:0;top:0;z-index:16;background:#0c1220;overflow-y:auto;color:#f1f3ff}
  .gm-panel[hidden]{display:none}.gm-body{padding:14px 14px 24px}
  .gm-title{font-size:20px;font-weight:800}.gm-sub{font-size:12px;color:#9ba9c5;margin:4px 0 10px;line-height:1.5}
  .gm-h{font-size:13px;color:#c2caff;margin:18px 0 6px;font-weight:700}
  .gm-card{display:flex;gap:12px;align-items:center;width:100%;text-align:left;margin-top:8px;padding:13px;background:#1a2438;border:1px solid #2b3852;border-radius:14px}
  .gm-card .ic{font-size:28px}.gm-card b{display:block}.gm-card small{display:block;font-weight:500;color:#9ba9c5;margin-top:2px;line-height:1.4}
  .gm-row{display:flex;align-items:center;gap:10px;padding:9px;border-radius:12px;background:#1b263b;margin-top:7px}
  .gm-row .g{flex:1;min-width:0}.gm-row b{display:block;font-size:13px;overflow-wrap:anywhere}.gm-row small{font-size:10px;color:#9ba9c5}
  .gm-row button{padding:7px 11px;font-size:12px}.gm-row.me{border:1px solid #778cff}
  .gm-rank{width:28px;text-align:center;font-weight:900;color:#9eafd2}
  .gm-note{font-size:12px;color:#9ba9c5;padding:6px 2px;line-height:1.5}
  .gm-head{display:flex;align-items:center;gap:10px;margin-bottom:10px}.gm-head .t{flex:1}.gm-head b{display:block}.gm-head small{color:#9ba9c5;font-size:11px}
  .gm-back{background:#26324d;padding:8px 12px}
  .gm-status{text-align:center;font-weight:700;margin:12px 0;min-height:22px}
  .gm-seg{display:flex;gap:8px;margin:8px 0}.gm-seg button{flex:1;padding:10px 6px;font-size:13px;background:#1a2438;border:1px solid #2b3852}.gm-seg button.on{background:#3b4590;border-color:#6d75ff}
  .gm-in{width:100%;box-sizing:border-box;margin-top:8px;padding:11px;border-radius:12px;border:1px solid #33435f;background:#101a2c;color:#fff;font-size:15px}
  .gm-act{display:block;width:100%;margin-top:10px;padding:12px}
  .gm-boxes{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-width:300px;margin:8px auto}
  .gm-box{aspect-ratio:1;font-size:30px;background:#1a2438;border:1px solid #33435f;border-radius:14px;padding:0}
  .gm-q{font-size:34px;font-weight:900;text-align:center;margin:14px 0}.gm-timer{text-align:center;font-size:18px;font-weight:800;color:#ffd479}
  .gm-chips{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:8px 0}.gm-chips button{padding:9px 14px;background:#1a2438;border:1px solid #33435f}.gm-chips button.on{background:#3b4590;border-color:#6d75ff}
  .gm-code{font-size:34px;letter-spacing:6px;font-weight:900;text-align:center;margin:10px 0;color:#ffd479}
  .gm-result{text-align:center;padding:12px;border-radius:14px;background:#173629;color:#72e3ad;font-weight:800;margin-top:12px}
  .gm-result.lose{background:#3a1b25;color:#ff9aa5}.gm-result.draw{background:#243049;color:#c2caff}
  .gm-bdg{position:absolute;top:2px;right:calc(50% - 22px);background:#f0788d;color:#fff;border-radius:9px;font-size:10px;font-weight:800;padding:0 5px;min-width:16px;text-align:center}
  #gmTab{position:relative}
  .gm-toast{position:fixed;left:50%;bottom:80px;transform:translateX(-50%);background:#222c45;color:#fff;padding:9px 14px;border-radius:12px;font-size:13px;z-index:10050;display:none;max-width:90vw}
  .gm-toast.show{display:block}
  .gm-modal{position:fixed;inset:0;z-index:10040;background:#000a;display:flex;align-items:center;justify-content:center;padding:18px}
  .gm-modal[hidden]{display:none}
  .gm-mbox{width:min(340px,100%);background:#151e30;border:1px solid #394866;border-radius:18px;padding:18px;text-align:center}
  .gm-mbox p{margin:8px 0;line-height:1.5}.gm-mbtns{display:flex;gap:10px;margin-top:12px}.gm-mbtns button{flex:1;padding:11px}`;
  document.head.appendChild(style);

  const tab = el('button', 'nav-btn'); tab.type = 'button'; tab.id = 'gmTab';
  const tabBadge = el('span', 'gm-bdg'); tabBadge.hidden = true;
  tab.append(el('strong', '', '🎮'), 'Games', tabBadge);
  const anchor = $('dmTab') || $('chatTab');
  if (anchor) anchor.after(tab); else nav.appendChild(tab);
  nav.style.gridTemplateColumns = 'none'; nav.style.gridAutoFlow = 'column'; nav.style.gridAutoColumns = '1fr';
  const panel = el('section', 'gm-panel'); panel.hidden = true;
  const body = el('div', 'gm-body'); panel.appendChild(body); app.appendChild(panel);
  const toastEl = el('div', 'gm-toast'); document.body.appendChild(toastEl);
  const toast = t => { toastEl.textContent = t; toastEl.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 4000); };
  const modal = el('div', 'gm-modal'); modal.hidden = true; document.body.appendChild(modal);
  let showdownOverlay = null;
  function closeShowdown() {
    if (!showdownOverlay) return;
    const frame = showdownOverlay.querySelector('iframe');
    if (frame) { frame.src = 'about:blank'; frame.remove(); }
    showdownOverlay.remove(); showdownOverlay = null;
  }
  function openShowdown() {
    if (showdownOverlay) return;
    const overlay = el('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10060;background:#05070d;display:flex;flex-direction:column;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';
    const bar = el('div'); bar.style.cssText = 'height:44px;flex:none;display:flex;align-items:center;gap:10px;padding:0 12px;background:#101827;color:#fff;font:700 14px system-ui';
    const close = btn('✕', closeShowdown, 'gm-back'); close.style.cssText = 'flex:none;width:42px;height:34px;padding:0;font-size:18px';
    bar.append(close, el('b', '', '🥊 Dosto Showdown'));
    const frame = document.createElement('iframe');
    frame.title = 'Dosto Showdown'; frame.src = './features/games/showdown.html?v=1';
    frame.allow = 'autoplay; fullscreen; gamepad';
    frame.style.cssText = 'border:0;display:block;width:100%;height:calc(100% - 44px);flex:1;background:#000';
    overlay.append(bar, frame); document.body.appendChild(overlay); showdownOverlay = overlay;
  }

  function avatar(uid, size) {
    const a = el('div'); a.style.cssText = 'flex:none;border-radius:50%;overflow:hidden;display:grid;place-items:center;background:linear-gradient(135deg,#6d75ff,#9b6cff);color:#fff;font-weight:800;width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.42) + 'px';
    const src = safeImg(users[uid] && users[uid].avatar);
    if (src) { const i = document.createElement('img'); i.src = src; i.alt = ''; i.style.cssText = 'width:100%;height:100%;object-fit:cover'; a.appendChild(i); } else a.textContent = nameOf(uid).slice(0, 1).toUpperCase();
    return a;
  }
  const inputEl = (k, ph, type, val) => { const i = el('input', 'gm-in'); i.dataset.k = k; i.placeholder = ph; i.type = type || 'text'; if (type === 'number') i.inputMode = 'numeric'; i.autocomplete = 'off'; if (val != null) i.value = val; return i; };
  const inputVal = k => { const i = body.querySelector('[data-k="' + k + '"]'); return i ? i.value : ''; };

  // ---------- screens ----------
  function renderHome() {
    const w = el('div'), h = scores[me.uid] || {};
    const title = titleOf(me.uid), bd = badgesOf(me.uid);
    w.append(el('div', 'gm-title', '🎮 Game Zone'),
      el('div', 'gm-sub', '🏆 ' + pointsOf(me.uid) + ' pts  •  ' + (Number(h.wins) || 0) + 'W ' + (Number(h.losses) || 0) + 'L' + (title ? '  •  ' + title : '') + (bd.length ? '\n' + bd.join('  ') : '')));
    w.lastChild.style.whiteSpace = 'pre-line';
    Object.keys(GAMES).forEach(k => {
      const b = btn('', () => { sel = k; screen = 'gameHome'; msg = ''; render(); }, 'gm-card'), m = el('div');
      m.append(el('b', '', GAMES[k].name), el('small', '', GAMES[k].rules));
      b.append(el('span', 'ic', GAMES[k].icon), m); w.appendChild(b);
    });
    const showdown = btn('', openShowdown, 'gm-card'), sm = el('div');
    sm.append(el('b', '', '🥊 Dosto Showdown'), el('small', '', 'Fighting game • Solo vs CPU • 2 Player • Online room code'));
    showdown.append(el('span', 'ic', '🔥'), sm); w.appendChild(showdown);
    w.appendChild(btn(h.hideBadges ? '👁️ Game badges dikhao' : '🙈 Game badges chhupao', () => setHide(!h.hideBadges), 'gm-act'));
    w.appendChild(el('div', 'gm-h', '🏆 Game Leaderboard'));
    const rows = lbData().slice(0, 10);
    if (!rows.length) w.appendChild(el('div', 'gm-note', 'Abhi kisi ne game nahi khela. Pehle jeeto!'));
    rows.forEach(r => {
      const row = el('div', 'gm-row' + (r.uid === me.uid ? ' me' : '')), g = el('div', 'g'), bs = badgesOf(r.uid).join(' ');
      g.append(el('b', '', r.name + (r.rank <= 3 ? '  ' + TITLES[r.rank - 1] : '')), el('small', '', r.wins + 'W ' + r.losses + 'L' + (bs ? '  ' + bs : '')));
      row.append(el('div', 'gm-rank', medal(r.rank)), g, el('b', '', r.points + ' pts')); w.appendChild(row);
    });
    body.replaceChildren(w);
  }
  function header(text, sub, backFn) {
    const head = el('div', 'gm-head'), t = el('div', 't');
    t.append(el('b', '', text), el('small', '', sub || '')); head.append(btn('←', backFn, 'gm-back'), t); return head;
  }
  function renderGameHome() {
    const w = el('div'), g = GAMES[sel];
    w.append(header(g.icon + ' ' + g.name, '', () => { screen = 'games'; render(); }), el('div', 'gm-sub', g.rules));
    const mode = (label, sub, fn) => { const b = btn('', fn, 'gm-card'), m = el('div'); m.append(el('b', '', label), el('small', '', sub)); b.appendChild(m); return b; };
    w.append(mode('🤖 Single Player', 'Akele khelo — points badhao ya ghatao', startSingle),
      mode('🌐 Multiplayer', '1v1, 2v2, 4v4 — room code se custom room', () => { screen = 'multi'; msg = ''; render(); }),
      mode('⚔️ Challenge Someone', 'Username daalo, stake lagao', () => { screen = 'challenge'; msg = ''; render(); }));
    body.replaceChildren(w);
  }
  function renderMulti() {
    const w = el('div');
    w.append(header('🌐 Multiplayer', GAMES[sel].name, () => { screen = 'gameHome'; render(); }), el('div', 'gm-h', 'Room banao'));
    const seg = el('div', 'gm-seg'); SIZES.forEach(s => seg.appendChild(btn(s, () => { multiSize = s; render(); }, s === multiSize ? 'on' : ''))); w.appendChild(seg);
    w.appendChild(btn('➕ Create Room', createRoom, 'gm-act'));
    w.appendChild(el('div', 'gm-h', 'Code se join karo'));
    const code = inputEl('code', 'ROOM CODE', 'text'); code.maxLength = 5; code.style.textTransform = 'uppercase'; w.appendChild(code);
    w.appendChild(btn('Join Room', () => joinByCode(inputVal('code')), 'gm-act'));
    if (msg) w.appendChild(el('div', 'gm-note', msg));
    body.replaceChildren(w);
  }
  function renderChallenge() {
    const w = el('div');
    w.append(header('⚔️ Challenge Someone', GAMES[sel].name, () => { screen = 'gameHome'; render(); }),
      el('div', 'gm-sub', 'Jisko challenge karna hai uska username likho (jaise #rahul). Wo online hona chahiye, 15 sec mein jawab dena hoga. Jeetne wale ko stake milta hai, haarne wale se kat-ta hai.'),
      inputEl('uname', 'Enter username', 'text'), inputEl('stake', 'Stake (points) — max ' + MAX_STAKE, 'number', '50'),
      btn('⚔️ Challenge', sendChallenge, 'gm-act'));
    if (msg) w.appendChild(el('div', 'gm-status', msg));
    w.appendChild(el('div', 'gm-note', 'Aapke points: ' + pointsOf(me.uid)));
    body.replaceChildren(w);
  }

  function luckUI(r, w) {
    const pk = (r.g.picks && r.g.picks[me.uid]) || {}; let k = 1; while (k <= 3 && pk['r' + k] != null) k++;
    const line = [];
    for (let i = 1; i < k && i <= 3; i++) line.push('R' + i + ' ' + (String(r.g.boxes['r' + i]).split(',').map(Number).includes(Number(pk['r' + i])) ? '✅' : '❌'));
    if (line.length) w.appendChild(el('div', 'gm-status', line.join('    ')));
    if (r.status === 'playing' && k <= 3) {
      w.appendChild(el('div', 'gm-note', 'Round ' + k + '/3 — ek box chuno (9 mein se 2 sahi)'));
      const g = el('div', 'gm-boxes'); for (let i = 0; i < 9; i++) g.appendChild(btn('📦', () => luckPick(k, i), 'gm-box')); w.appendChild(g);
    } else if (r.status === 'playing') w.appendChild(el('div', 'gm-note', 'Aapke 3 round ho gaye. Baaki players ka wait...'));
    else w.appendChild(el('div', 'gm-note', 'Sahi boxes: ' + [1, 2, 3].map(i => 'R' + i + ' → ' + String(r.g.boxes['r' + i]).split(',').map(n => Number(n) + 1).join(' & ')).join('  •  ')));
  }
  function betUI(r, w) {
    const mine = (r.g.picks || {})[me.uid];
    if (r.status === 'playing' && !mine) {
      const seg = el('div', 'gm-seg');
      seg.append(btn('🙂 Head', () => { pickSide = 'h'; render(); }, pickSide === 'h' ? 'on' : ''), btn('🦅 Tail', () => { pickSide = 't'; render(); }, pickSide === 't' ? 'on' : ''));
      w.appendChild(seg);
      if (r.mode === 'challenge') w.appendChild(el('div', 'gm-note', 'Stake: ' + r.stake + ' pts'));
      else {
        const opts = [10, 25, 50, 100].filter(v => v <= Math.min(MAX_BET, pointsOf(me.uid)));
        if (!opts.length) w.appendChild(el('div', 'gm-note', 'Bet ke liye kam se kam 10 points chahiye.'));
        else { if (!opts.includes(pickBet)) pickBet = opts[0]; const ch = el('div', 'gm-chips'); opts.forEach(v => ch.appendChild(btn(String(v), () => { pickBet = v; render(); }, v === pickBet ? 'on' : ''))); w.append(el('div', 'gm-note', 'Bet amount:'), ch); }
      }
      w.appendChild(btn('🪙 Flip!', betPick, 'gm-act'));
    } else if (r.status === 'playing') w.appendChild(el('div', 'gm-status', '✅ Pick ho gaya, baaki players ka wait...'));
    else w.appendChild(el('div', 'gm-q', r.g.flip === 'h' ? '🙂 Head' : '🦅 Tail'));
  }
  function calcUI(r, w) {
    w.appendChild(el('div', 'gm-q', r.g.q + ' = ?'));
    const mine = (r.g.answers || {})[me.uid];
    if (r.status === 'playing') { const t = el('div', 'gm-timer'); t.id = 'gmTimer'; t.textContent = '⏱️ ' + Math.max(0, Math.ceil((r.g.ends - now()) / 1000)) + 's'; w.appendChild(t); }
    if (r.status === 'playing' && !mine) {
      const i = inputEl('ans', 'Jawab likho', 'number'); i.addEventListener('keydown', e => { if (e.key === 'Enter') calcAnswer(); });
      w.append(i, btn('Submit', calcAnswer, 'gm-act'));
    } else if (mine) w.appendChild(el('div', 'gm-status', 'Aapka jawab: ' + mine.a + (r.status === 'playing' ? ' — baaki ka wait...' : '')));
    if (r.status === 'done') w.appendChild(el('div', 'gm-note', 'Sahi jawab: ' + r.g.ans));
  }
  function lobbyUI(r, w) {
    w.append(el('div', 'gm-note', 'Ye code dosto ko bhejo, wo "Join Room" mein daalenge:'), el('div', 'gm-code', r.code));
    ['A', 'B'].forEach(team => {
      w.appendChild(el('div', 'gm-h', 'Team ' + team + ' (' + Object.keys(r.players || {}).filter(u => r.players[u].team === team).length + '/' + r.size + ')'));
      Object.keys(r.players || {}).filter(u => r.players[u].team === team).forEach(u => {
        const row = el('div', 'gm-row'), g = el('div', 'g'); g.appendChild(el('b', '', nameOf(u) + (u === r.host ? ' 👑 Host' : '')));
        row.append(avatar(u, 34), g);
        if (r.host === me.uid && u !== me.uid) row.appendChild(btn('Kick', () => kick(u), 'gm-back'));
        w.appendChild(row);
      });
    });
    if (r.host === me.uid) {
      const ps = r.players || {}, a = Object.keys(ps).some(u => ps[u].team === 'A'), b = Object.keys(ps).some(u => ps[u].team === 'B');
      w.appendChild(btn(a && b ? '▶️ Start Game' : 'Start ke liye dono teams mein 1 player chahiye', startRoom, 'gm-act')).disabled = !(a && b);
    } else w.appendChild(el('div', 'gm-status', 'Host ke start karne ka wait...'));
  }
  function resultUI(r, w) {
    const o = r.out && r.out[me.uid]; if (!o) return;
    const txt = o.left ? '🚪 Aapne game chhod diya' : o.res === 'win' ? '🎉 Aap jeet gaye!' : o.res === 'draw' ? '🤝 Draw raha' : '😅 Aap haar gaye';
    w.appendChild(el('div', 'gm-result' + (o.res === 'loss' ? ' lose' : o.res === 'draw' ? ' draw' : ''), txt + '  (' + (o.d >= 0 ? '+' : '') + o.d + ' pts)'));
    const info = [];
    if (o.hits != null) info.push('Aapke sahi: ' + o.hits + '/3');
    if (o.team) info.push('Team A ' + o.team.A + ' – ' + o.team.B + ' Team B');
    if (o.first) info.push('Pehle sahi: ' + nameOf(o.first));
    if (o.oppLeft) info.push('Opponent room chhod gaya');
    if (info.length) w.appendChild(el('div', 'gm-note', info.join('  •  ')));
    if (r.mode !== 'single') {
      const ps = r.players || {};
      Object.keys(ps).forEach(u => { const x = r.out[u]; if (!x) return; const row = el('div', 'gm-row'), g = el('div', 'g'); g.append(el('b', '', nameOf(u) + ' (' + ps[u].team + ')'), el('small', '', x.res)); row.append(avatar(u, 30), g, el('b', '', (x.d >= 0 ? '+' : '') + x.d)); w.appendChild(row); });
    }
    if (r.mode === 'single') w.appendChild(btn('🔁 Play again', startSingle, 'gm-act'));
    w.appendChild(btn('← Back', leaveGame, 'gm-act'));
  }
  function renderPlay() {
    const r = cur(), w = el('div'), opp = Object.keys(r.players || {}).filter(u => u !== me.uid);
    const sub = r.mode === 'single' ? '🤖 Single Player' : r.mode === 'challenge' ? '⚔️ Challenge' + (opp[0] || r.invited ? ' vs ' + nameOf(opp[0] || r.invited) : '') + ' • ' + r.stake + ' pts' : '🌐 Room ' + r.code + ' • ' + r.size + 'v' + r.size;
    w.appendChild(header(GAMES[r.game].icon + ' ' + GAMES[r.game].name, sub, leaveGame));
    if (r.status === 'invited') {
      const s = el('div', 'gm-status', '⏳ ' + nameOf(r.invited) + ' ke response ka wait... ' + Math.max(0, Math.ceil((CHALLENGE_MS - (now() - (Number(r.ts) || inviteSentAt))) / 1000)) + 's'); s.id = 'gmWait'; w.appendChild(s);
      w.appendChild(btn('Cancel', leaveGame, 'gm-act'));
    } else if (r.status === 'expired') { w.appendChild(el('div', 'gm-status', '😕 No response. Try again later.')); w.appendChild(btn('← Back', leaveGame, 'gm-act')); }
    else if (r.status === 'rejected') { w.appendChild(el('div', 'gm-status', '❌ ' + nameOf(r.invited) + ' ne challenge reject kar diya.')); w.appendChild(btn('← Back', leaveGame, 'gm-act')); }
    else if (r.status === 'lobby') { lobbyUI(r, w); w.appendChild(btn('Leave Room', leaveGame, 'gm-act')); }
    else {
      if (r.game === 'luck') luckUI(r, w); else if (r.game === 'bet') betUI(r, w); else calcUI(r, w);
      if (r.status === 'done') resultUI(r, w);
    }
    body.replaceChildren(w);
  }
  function updateBadge() {
    const n = Object.keys(invites).filter(id => invites[id] && now() - (Number(invites[id].ts) || 0) < CHALLENGE_MS).length;
    tabBadge.hidden = !n; tabBadge.textContent = String(n);
  }
  function render() {
    if (!me) { body.replaceChildren(); return; }
    const keep = {}; let focusK = null;
    body.querySelectorAll('.gm-in').forEach(i => { keep[i.dataset.k] = i.value; if (document.activeElement === i) focusK = i.dataset.k; });
    if (local || roomId) { if (cur()) renderPlay(); else body.replaceChildren(); }
    else if (screen === 'gameHome' && sel) renderGameHome(); else if (screen === 'multi' && sel) renderMulti(); else if (screen === 'challenge' && sel) renderChallenge(); else renderHome();
    body.querySelectorAll('.gm-in').forEach(i => { if (keep[i.dataset.k] != null && keep[i.dataset.k] !== '') i.value = keep[i.dataset.k]; if (focusK === i.dataset.k) i.focus(); });
    updateBadge();
  }

  // ---------- engine actions (single = local, baaki = firebase transaction) ----------
  const roomRef = id => db.ref('gameRooms/' + id);
  function tx(fn) {
    if (local) { const res = fn(local); if (res !== undefined) local = res; if (local.status === 'done') applyOnce(local); render(); return Promise.resolve(); }
    return roomRef(roomId).transaction(fn).catch(e => toast(fbErr(e)));
  }
  function startSingle() {
    timeoutSent = null; pickSide = null;
    local = { mode: 'single', game: sel, status: 'playing', ts: Date.now(), players: { [me.uid]: { name: nameOf(me.uid), team: 'A' } }, g: newG(sel, false) };
    appliedFor = null; render();
  }
  const luckPick = (k, i) => tx(r => {
    if (!r || r.status !== 'playing' || !r.g) return;
    r.g.picks = r.g.picks || {}; const p = r.g.picks[me.uid] = r.g.picks[me.uid] || {};
    if (p['r' + k] != null) return; p['r' + k] = i; checkDone(r); return r;
  });
  function betPick() {
    if (!pickSide) { toast('Pehle Head ya Tail chuno.'); return; }
    const side = pickSide, bet = (cur().mode === 'challenge') ? 0 : pickBet;
    if (cur().mode !== 'challenge' && (bet < 1 || bet > pointsOf(me.uid))) { toast('Bet ke liye points kam hain.'); return; }
    tx(r => { if (!r || r.status !== 'playing') return; r.g.picks = r.g.picks || {}; if (r.g.picks[me.uid]) return; r.g.picks[me.uid] = { side, bet }; checkDone(r); return r; });
  }
  function calcAnswer() {
    const raw = inputVal('ans'); if (raw === '' || isNaN(Number(raw))) { toast('Number likho.'); return; }
    const val = Number(raw);
    tx(r => { if (!r || r.status !== 'playing' || now() > r.g.ends + 1500) return; r.g.answers = r.g.answers || {}; if (r.g.answers[me.uid]) return; r.g.answers[me.uid] = { a: val, t: now() }; checkDone(r); return r; });
  }
  const calcTimeout = () => tx(r => { if (!r || r.status !== 'playing' || r.game !== 'calc' || now() < r.g.ends) return; finalize(r); return r; });

  // ---------- online rooms ----------
  function watchRoom(id) {
    stopRoom(); roomId = id; room = null; appliedFor = null; timeoutSent = null; pickSide = null; firstSnap = true;
    const ready = new Promise(res => { resolveReady = res; });
    const r = roomRef(id), cb = s => { room = s.val(); onRoom(); if (resolveReady) { resolveReady(); resolveReady = null; } };
    r.on('value', cb, () => {}); roomOffs.push(() => r.off('value', cb));
    return ready;
  }
  function stopRoom() { roomOffs.forEach(f => { try { f(); } catch (_) {} }); roomOffs = []; }
  function onRoom() {
    if (!roomId) return;
    if (!room) { toast(firstSnap ? 'Room nahi mila.' : 'Room band ho gaya.'); firstSnap = false; exitGame(); return; }
    firstSnap = false;
    if (room.mode === 'room' && room.status === 'lobby' && !(room.players && room.players[me.uid])) { toast('Aapko room se hata diya gaya.'); exitGame(); return; }
    if (room.status === 'playing' && panel.hidden) openPanel();
    if (room.status === 'done') applyOnce(room);
    render();
  }
  function exitGame() { stopRoom(); roomId = null; room = null; local = null; screen = sel ? 'gameHome' : 'games'; render(); }
  const genCode = () => { const c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 5; i++) s += c[rand(c.length)]; return s; };
  async function createRoom() {
    if (!me || roomId || local) return;
    try {
      let code = '';
      for (let n = 0; n < 5 && !code; n++) { const c = genCode(); if (!(await db.ref('gameCodes/' + c).once('value')).exists()) code = c; }
      if (!code) throw new Error('Code nahi ban paya, dobara try karo.');
      const id = db.ref('gameRooms').push().key;
      await db.ref().update({ ['gameRooms/' + id]: { game: sel, mode: 'room', size: Number(multiSize[0]), code, host: me.uid, status: 'lobby', players: { [me.uid]: { name: nameOf(me.uid), team: 'A' } }, ts: TS() }, ['gameCodes/' + code]: id });
      try { db.ref('gameCodes/' + code).onDisconnect().remove(); } catch (_) {}
      watchRoom(id);
    } catch (e) { toast(fbErr(e)); }
  }
  async function joinByCode(raw) {
    const code = String(raw || '').trim().toUpperCase();
    if (!code) { msg = 'Room code likho.'; render(); return; }
    try {
      const id = (await db.ref('gameCodes/' + code).once('value')).val();
      if (!id) { msg = '❌ Ye code galat hai ya room band ho gaya.'; render(); return; }
      await watchRoom(id); if (!room) return;
      const res = await roomRef(id).transaction(r => {
        if (!r || r.status !== 'lobby' || r.mode !== 'room') return;
        if (r.kicked && r.kicked[me.uid]) return;
        const ps = r.players = r.players || {}; if (ps[me.uid]) return r;
        const cnt = t => Object.keys(ps).filter(u => ps[u].team === t).length, cap = Number(r.size) || 1;
        const team = cnt('A') <= cnt('B') ? 'A' : 'B';
        if (cnt(team) >= cap) return;
        ps[me.uid] = { name: nameOf(me.uid), team }; return r;
      });
      if (!res.committed) { msg = '❌ Room join nahi ho paya (full / start ho chuka / aapko hataya gaya).'; exitGame(); screen = 'multi'; render(); }
    } catch (e) { toast(fbErr(e)); exitGame(); }
  }
  const kick = uid => tx(r => { if (!r || r.host !== me.uid || r.status !== 'lobby') return; if (r.players) delete r.players[uid]; r.kicked = r.kicked || {}; r.kicked[uid] = true; return r; });
  async function startRoom() {
    const code = room && room.code;
    await tx(r => {
      if (!r || r.status !== 'lobby' || r.host !== me.uid) return;
      const ps = r.players || {}, ks = Object.keys(ps);
      if (!ks.some(u => ps[u].team === 'A') || !ks.some(u => ps[u].team === 'B')) return;
      r.g = newG(r.game, true); r.status = 'playing'; return r;
    });
    if (code) db.ref('gameCodes/' + code).remove().catch(() => {});
  }
  async function leaveGame() {
    const r = cur();
    if (local || !r) { exitGame(); return; }
    const id = roomId, host = r.host === me.uid;
    try {
      if (r.status === 'lobby') {
        if (host) await db.ref().update({ ['gameRooms/' + id]: null, ['gameCodes/' + r.code]: null });
        else await roomRef(id).transaction(x => { if (!x || x.status !== 'lobby') return; if (x.players) delete x.players[me.uid]; return x; });
      } else if (r.status === 'invited' || r.status === 'expired' || r.status === 'rejected') {
        if (host) await db.ref().update({ ['gameRooms/' + id]: null, ['gameInvites/' + r.invited + '/' + id]: null });
      } else if (r.status === 'playing') {
        const res = await roomRef(id).transaction(x => {
          if (!x || x.status !== 'playing') return;
          if (x.players && x.players[me.uid]) x.players[me.uid].left = true;
          const a = active(x), teams = new Set(a.map(u => x.players[u].team));
          if (x.mode === 'challenge' || teams.size < 2) finalize(x); else checkDone(x);
          return x;
        });
        if (res.committed) {
          const v = res.snapshot && res.snapshot.val(), o = v && v.out && v.out[me.uid];
          appliedFor = id; applyOutcome(r.game, 'loss', o ? o.d : D.leave);
          roomRef(id).child('applied/' + me.uid).set(true).catch(() => {});
        }
      } else if (r.status === 'done') {
        applyOnce(r);
        const ps = r.players || {}, all = Object.keys(ps).every(u => u === me.uid || (r.applied && r.applied[u]));
        if (all) await db.ref().update({ ['gameRooms/' + id]: null, ['gameCodes/' + (r.code || '_')]: null });
      }
    } catch (e) { toast(fbErr(e)); }
    exitGame();
  }

  // ---------- challenge someone ----------
  const findUid = name => { const n = String(name).toLowerCase(); return Object.keys(users).find(u => u !== me.uid && (String(users[u].username || '').toLowerCase() === n || String(users[u].chatName || '').toLowerCase() === n)); };
  async function sendChallenge() {
    const fail = m => { msg = m; render(); };
    const raw = String(inputVal('uname') || '').trim().replace(/^[#@]/, ''), stake = Math.floor(Number(inputVal('stake')) || 0);
    if (!raw) return fail('Username likho.');
    const uid = findUid(raw); if (!uid) return fail('❌ Ye username nahi mila.');
    if (stake < 1 || stake > MAX_STAKE) return fail('Stake 1 se ' + MAX_STAKE + ' ke beech rakho.');
    if (stake > pointsOf(me.uid)) return fail('Aapke paas itne points nahi hain.');
    if (stake > pointsOf(uid)) return fail(nameOf(uid) + ' ke paas itne points nahi hain.');
    const wait = COOL_MS - (now() - (Number(cool[uid]) || 0));
    if (wait > 0) return fail('⏳ Ek bande ko 1 minute mein sirf ek hi challenge bhej sakte ho. ' + Math.ceil(wait / 1000) + ' sec ruko.');
    let online = false; try { online = (await db.ref('online/' + uid).once('value')).exists(); } catch (_) {}
    if (!online) return fail('🔴 ' + nameOf(uid) + ' abhi online nahi hai.');
    try {
      const id = db.ref('gameRooms').push().key;
      await db.ref().update({
        ['gameRooms/' + id]: { game: sel, mode: 'challenge', size: 1, stake, host: me.uid, invited: uid, status: 'invited', players: { [me.uid]: { name: nameOf(me.uid), team: 'A' } }, ts: TS() },
        ['gameInvites/' + uid + '/' + id]: { from: me.uid, game: sel, stake, ts: TS() },
        ['gameCool/' + me.uid + '/' + uid]: TS()
      });
      msg = ''; inviteSentAt = Date.now(); watchRoom(id);
    } catch (e) { fail(fbErr(e)); }
  }
  async function acceptChallenge(id, inv) {
    closeModal();
    if (roomId || local) { toast('Pehle current game khatam karo.'); return; }
    if (pointsOf(me.uid) < (Number(inv.stake) || 0)) { toast('Aapke paas itne points nahi hain.'); rejectChallenge(id); return; }
    await watchRoom(id); if (!room) return;
    try {
      const res = await roomRef(id).transaction(r => {
        if (!r || r.status !== 'invited' || r.invited !== me.uid) return;
        r.players = r.players || {}; r.players[me.uid] = { name: nameOf(me.uid), team: 'B' };
        r.g = newG(r.game, true); r.status = 'playing'; return r;
      });
      if (!res.committed) { toast('Challenge expire ho gaya.'); exitGame(); return; }
      db.ref('gameInvites/' + me.uid + '/' + id).remove().catch(() => {});
      sel = room ? room.game : sel; openPanel();
    } catch (e) { toast(fbErr(e)); exitGame(); }
  }
  function rejectChallenge(id) {
    closeModal();
    db.ref('gameRooms/' + id + '/status').set('rejected').catch(() => {});
    db.ref('gameInvites/' + me.uid + '/' + id).remove().catch(() => {});
  }
  function closeModal() { modal.hidden = true; modalId = null; modal.replaceChildren(); }
  function showInvite(id, inv) {
    closeModal(); modalId = id; modalEnd = (Number(inv.ts) || now()) + CHALLENGE_MS;
    const box = el('div', 'gm-mbox'), left = el('p', '', ''); left.id = 'gmMLeft';
    const g = GAMES[inv.game] || { name: 'game' };
    box.append(el('div', '', '⚔️'), el('p', '', nameOf(inv.from) + ' ne aapko challenge kiya "' + g.name + '" par.'), el('p', '', 'Stake: ' + inv.stake + ' pts. Accept karna hai?'), left);
    const row = el('div', 'gm-mbtns'); row.append(btn('✓ Accept', () => acceptChallenge(id, inv)), btn('✕ Reject', () => rejectChallenge(id), 'gm-back'));
    box.appendChild(row); modal.appendChild(box); modal.hidden = false;
  }

  // ---------- ticker (timers) ----------
  function tick() {
    if (!me) return;
    const r = cur();
    if (r && r.status === 'playing' && r.game === 'calc' && r.g) {
      const t = $('gmTimer'); if (t) t.textContent = '⏱️ ' + Math.max(0, Math.ceil((r.g.ends - now()) / 1000)) + 's';
      const key = roomId || ('L' + (local && local.ts));
      if (now() >= r.g.ends + 300 && timeoutSent !== key) { timeoutSent = key; calcTimeout(); }
    }
    if (r && !local && r.status === 'invited' && r.host === me.uid) {
      const left = CHALLENGE_MS - (now() - (Number(r.ts) || inviteSentAt)), w = $('gmWait');
      if (w) w.textContent = '⏳ ' + nameOf(r.invited) + ' ke response ka wait... ' + Math.max(0, Math.ceil(left / 1000)) + 's';
      if (left <= 0) { db.ref('gameRooms/' + roomId + '/status').set('expired').catch(() => {}); db.ref('gameInvites/' + r.invited + '/' + roomId).remove().catch(() => {}); }
    }
    if (!modal.hidden) {
      const left = modalEnd - now(), t = $('gmMLeft'); if (t) t.textContent = '⏳ ' + Math.max(0, Math.ceil(left / 1000)) + 's';
      if (left <= 0) closeModal();
    }
  }

  // ---------- tab ----------
  function openPanel() {
    if (!me) return;
    const lb = document.querySelector('.lb-wrap.open'); if (lb) lb.classList.remove('open');
    document.querySelectorAll('.pf-panel,.st-panel,.dm-panel').forEach(p => { p.hidden = true; });
    panel.style.bottom = nav.offsetHeight + 'px'; panel.hidden = false;
    nav.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b === tab));
    render();
  }
  function closePanel() { panel.hidden = true; tab.classList.remove('active'); }
  listen(tab, 'click', () => { if (panel.hidden) openPanel(); else { const ct = $('chatTab'); if (ct) ct.click(); } });
  listen(nav, 'click', e => { const b = e.target.closest('.nav-btn'); if (b && b !== tab && !panel.hidden) closePanel(); });

  // ---------- existing Leaderboard panel mein "Game Points" tab ----------
  let lbBtn = null, lbActive = false, lbObs = null, lbTabs = null;
  function paintLb() {
    const content = $('lbContent'); if (!content) return;
    const w = el('div', 'lb-panel'); w.dataset.gmLb = '1'; w.appendChild(el('h3', '', '🎮 Game Points'));
    const rows = lbData();
    if (!rows.length) w.appendChild(el('div', 'lb-empty', 'Abhi kisi ne game nahi khela. Games tab se khelna shuru karo!'));
    const list = el('div', 'lb-list');
    rows.forEach(r => {
      const row = el('div', 'lb-row' + (me && r.uid === me.uid ? ' mine' : '')), p = el('div', 'lb-person'), s = el('div', 'lb-score'), bs = badgesOf(r.uid).join(' ');
      p.append(el('b', '', r.name + (r.rank <= 3 ? ' ' + TITLES[r.rank - 1] : '')), el('small', '', r.wins + 'W ' + r.losses + 'L' + (bs ? ' ' + bs : '')));
      s.appendChild(el('span', '', r.points + ' pts')); row.append(el('div', 'lb-rank', medal(r.rank)), p, s); list.appendChild(row);
    });
    w.appendChild(list); content.replaceChildren(w);
  }
  function mountLb() {
    const tabs = document.querySelector('.lb-tabs'), content = $('lbContent');
    if (!tabs || !content || lbBtn) return;
    lbTabs = tabs; lbBtn = el('button', '', '🎮 Game Points'); lbBtn.type = 'button';
    lbBtn.addEventListener('click', () => { lbActive = true; tabs.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === lbBtn)); paintLb(); });
    tabs.appendChild(lbBtn); tabs.addEventListener('click', lbCapture, true);
    lbObs = new MutationObserver(() => { if (lbActive && !content.querySelector('[data-gm-lb]')) paintLb(); });
    lbObs.observe(content, { childList: true });
  }
  function lbCapture(e) { if (e.target.closest('[data-tab]')) { lbActive = false; if (lbBtn) lbBtn.classList.remove('active'); } }
  function unmountLb() {
    if (lbObs) lbObs.disconnect(); if (lbTabs) lbTabs.removeEventListener('click', lbCapture, true);
    if (lbBtn) lbBtn.remove(); lbBtn = lbObs = lbTabs = null; lbActive = false;
  }

  // ---------- public API (Profile Hub use karta hai) ----------
  function setHide(flag) { if (!me || !db) return; db.ref('gameScores/' + me.uid + '/hideBadges').set(!!flag).catch(e => toast(fbErr(e))); }
  window.DostoGames = Object.freeze({
    open: () => openPanel(),
    points: uid => pointsOf(uid),
    title: uid => titleOf(uid),
    badges: uid => badgesOf(uid),
    hidden: uid => !!(scores[uid] && scores[uid].hideBadges),
    setHide,
    top: n => lbData().slice(0, n || 10)
  });
  const announce = () => { try { document.dispatchEvent(new CustomEvent('dosto-games-update')); } catch (_) {} };

  // ---------- session ----------
  function start(user) {
    stop();
    if (!user || !window.firebase || !firebase.database) return;
    me = user; db = firebase.database(); firstInv = true; screen = 'games'; sel = null;
    attach(db.ref('.info/serverTimeOffset'), 'value', s => { offset = Number(s.val()) || 0; });
    attach(db.ref('users'), 'value', s => { users = s.val() || {}; render(); if (lbActive) paintLb(); });
    attach(db.ref('gameScores'), 'value', s => { scores = s.val() || {}; if (!local && !roomId) render(); if (lbActive) paintLb(); announce(); });
    attach(db.ref('gameCool/' + me.uid), 'value', s => { cool = s.val() || {}; });
    attach(db.ref('gameInvites/' + me.uid), 'value', s => {
      const next = s.val() || {};
      Object.keys(next).forEach(id => { const inv = next[id]; if (inv && !invites[id] && now() - (Number(inv.ts) || 0) < CHALLENGE_MS) showInvite(id, inv); });
      if (modalId && !next[modalId]) closeModal();
      invites = next; firstInv = false; updateBadge();
    });
    ticker = setInterval(tick, 500);
    mountLb();
  }
  function stop() {
    offs.forEach(f => { try { f(); } catch (_) {} }); offs = []; stopRoom(); clearInterval(ticker);
    me = null; db = null; users = {}; scores = {}; cool = {}; invites = {}; local = null; roomId = null; room = null; sel = null; screen = 'games';
    closeModal(); closePanel(); closeShowdown(); body.replaceChildren(); tabBadge.hidden = true; unmountLb();
  }
  if (getUser()) start(getUser());
  const offLogin = on('login', u => start(u));
  const offLogout = on('logout', () => stop());

  return () => {
    offLogin(); offLogout(); stop();
    uiOffs.forEach(f => { try { f(); } catch (_) {} });
    clearTimeout(toastT);
    closeShowdown(); [style, tab, panel, toastEl, modal].forEach(n => n.remove());
    delete window.DostoGames;
  };
}
