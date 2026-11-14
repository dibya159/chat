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
    frame.title = 'Dosto Showdown'; frame.srcdoc = "<!DOCTYPE html><html lang=\"hi\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover\"><title>Dosto Showdown</title>\n<style>\n*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;touch-action:none}\nhtml,body{margin:0;height:100%;background:#000;color:#fff;font-family:system-ui,sans-serif;overflow:hidden}\n#g{position:relative;height:100dvh;width:100vw;max-width:calc(100dvh*2.3);margin:0 auto;background:#000;overflow:hidden}\ncanvas#c{width:100%;height:100%;display:block}\n.hid{display:none!important}\n#menu,#res{position:absolute;inset:0;background:radial-gradient(circle at 30% 0,#3b1d6e,#07080e 70%);padding:calc(8px + env(safe-area-inset-top)) calc(14px + env(safe-area-inset-right)) 8px calc(14px + env(safe-area-inset-left));overflow-y:auto;touch-action:pan-y;text-align:center}\n#menu{display:grid;grid-template-columns:1fr 1.1fr;gap:6px 16px;align-content:center}\n#menu *,#res *{touch-action:manipulation}\n#mL,#mR{min-width:0}#ocode{flex:1;min-width:0;text-transform:uppercase;background:#0f172a;color:#fff;border:1px solid #475569;border-radius:10px;padding:8px;font-weight:800;letter-spacing:2px;text-align:center;touch-action:manipulation}\n@media(orientation:portrait){#menu{grid-template-columns:1fr}}\nh1{margin:2px 0 0;font-size:30px;line-height:.95;letter-spacing:2px;background:linear-gradient(#fde68a,#f97316);-webkit-background-clip:text;color:transparent;font-weight:900}\nsmall{color:#fbbf24;font-size:10px;letter-spacing:1px}\n#pv{width:100%;height:auto;aspect-ratio:9/5;display:block;margin:6px 0;border-radius:12px;background:#0008;border:1px solid #f59e0b55}\n#inf{font-size:11px;color:#cbd5e1;min-height:30px}\n.row{display:flex;gap:6px;margin:5px 0}\nbutton{font:inherit;color:#fff;background:#1e293b;border:1px solid #475569;border-radius:10px;padding:8px 6px;font-weight:700;font-size:12px;flex:1}\nbutton.on{background:#f59e0b;color:#111;border-color:#fde68a}\n#ros{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}\n#ros button{padding:3px 2px;font-size:9px;display:flex;flex-direction:column;align-items:center;gap:1px}\n#ros button.a{border:2px solid #f59e0b;background:#f59e0b22}#ros button.b{border:2px solid #ef4444;background:#ef444422}\n#go{width:100%;margin-top:4px;padding:12px;font-size:16px;font-weight:900;letter-spacing:1px;background:linear-gradient(90deg,#dc2626,#f97316,#f59e0b);color:#111;border:0;box-shadow:0 0 18px #f59e0b88}\np.n{font-size:9px;color:#94a3b8;margin:6px 0 0}\n#ctl{position:absolute;inset:0;pointer-events:none}\n#ctl>*{pointer-events:auto}\n#jz{position:absolute;left:0;bottom:0;width:42%;height:75%}\n#joy{position:absolute;width:116px;height:116px;border-radius:50%;background:radial-gradient(#ffffff18,#ffffff06);border:2px solid #ffffff44;opacity:.4;pointer-events:none;transition:opacity .15s}\n#knob{position:absolute;left:33px;top:33px;width:50px;height:50px;border-radius:50%;background:radial-gradient(#fff,#94a3b8);box-shadow:0 2px 10px #000a}\n.bt{position:absolute;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#0f172acc;border:3px solid #ffffff77;box-shadow:0 3px 12px #000a;font-size:24px;color:#fff;--p:0%}\n.bt.on{transform:scale(.9);filter:brightness(1.5)}\n#bs{background:conic-gradient(#f59e0b var(--p),#1e293bdd 0)}#ba{background:conic-gradient(#22d3ee var(--p),#1e293bdd 0)}\n.rdy{animation:gl .6s infinite alternate}@keyframes gl{to{box-shadow:0 0 22px #fbbf24}}\n.sm{position:absolute;top:calc(58px + env(safe-area-inset-top));width:34px;height:28px;flex:none;padding:0;opacity:.75;background:#0008}\n</style></head><body><div id=\"g\"><canvas id=\"c\"></canvas>\n<div id=\"ctl\" class=\"hid\"><div id=\"jz\"></div><div id=\"joy\"><i id=\"knob\"></i></div>\n<div class=\"bt\" data-k=\"punch\" style=\"right:calc(26px + env(safe-area-inset-right));bottom:26px;width:80px;height:80px;font-size:34px\">👊</div>\n<div class=\"bt\" data-k=\"kick\" style=\"right:calc(116px + env(safe-area-inset-right));bottom:14px;width:68px;height:68px;font-size:28px\">🦵</div>\n<div class=\"bt\" data-k=\"up\" style=\"right:calc(40px + env(safe-area-inset-right));bottom:116px;width:56px;height:56px\">⤒</div>\n<div class=\"bt\" data-k=\"block\" style=\"right:calc(112px + env(safe-area-inset-right));bottom:92px;width:54px;height:54px\">🛡</div>\n<div class=\"bt\" data-k=\"sup\" id=\"bs\" style=\"right:calc(186px + env(safe-area-inset-right));bottom:64px;width:58px;height:58px\">⚡</div>\n<div class=\"bt\" data-k=\"assist\" id=\"ba\" style=\"right:calc(196px + env(safe-area-inset-right));bottom:6px;width:46px;height:46px;font-size:20px\">📕</div>\n<button id=\"pz\" class=\"sm\" style=\"right:10px\">⏸</button><button id=\"mt\" class=\"sm\" style=\"right:50px\" onclick=\"mute=!mute;this.textContent=mute?'🔇':'🔊';crowd()\">🔊</button></div>\n<div id=\"menu\"><div id=\"mL\"><h1>DOSTO SHOWDOWN</h1><small>THE GREAT ROAST &amp; KURSI FIGHT</small>\n<canvas id=\"pv\" width=\"720\" height=\"400\"></canvas><div id=\"inf\"></div>\n<div id=\"onl\" class=\"row\" style=\"flex-wrap:wrap\"><button onclick=\"onJoin(1)\">🌐 Room banao</button><input id=\"ocode\" placeholder=\"CODE\" maxlength=\"8\"><button onclick=\"onJoin(0)\">Code se judo</button><button id=\"ogo\" onclick=\"onGoBtn()\" style=\"display:none;flex-basis:100%;background:#16a34a\">▶ ONLINE FIGHT SHURU</button><div id=\"ost\" style=\"font-size:11px;color:#fbbf24;width:100%\"></div></div></div><div id=\"mR\">\n<div class=\"row\"><button id=\"s0\" onclick=\"slot=0;ui()\">1P · YOU</button><button id=\"s1\" onclick=\"slot=1;ui()\">CPU · OPPONENT</button></div>\n<div id=\"ros\"></div>\n<div class=\"row\"><button id=\"bst\" onclick=\"stg=(stg+1)%3;ui()\"></button><button id=\"bdf\" onclick=\"df=(df+1)%3;ui()\"></button></div>\n<div class=\"row\"><button id=\"bar\" onclick=\"arc=!arc;if(arc)two=false;ui()\"></button><button id=\"b2p\" onclick=\"two=!two;if(two)arc=false;ui()\"></button></div>\n<button id=\"go\" onclick=\"start()\">⚔️ FIGHT KARO!</button>\n<p class=\"n\">Joystick neeche kheench ke 👊 = uppercut, 🦵 = sweep · Keys: A/D W S J K L U I · 2P: arrows + M , . /<br>Satire game — sabhi characters kaalpnik hain.</p></div></div>\n<div id=\"res\" class=\"hid\"><h1 id=\"rt\" style=\"margin-top:30vh;font-size:44px\"></h1><p id=\"rp\" style=\"color:#cbd5e1\"></p><div class=\"row\"><button id=\"rem\" onclick=\"rematch()\">▶ Agla / Rematch</button><button onclick=\"toMenu()\">🏠 Menu</button></div></div>\n</div><script>\n/* Firebase room adapter for Dosto ka Chat. Runs in same-origin iframe and reuses parent Firebase auth/database. */\nwindow.claude = {\n  use: async function (service) {\n    if (service !== 'room') throw new Error('Unsupported service');\n    const hostWin = window.parent;\n    const fb = hostWin && hostWin.firebase;\n    if (!fb || !fb.database || !fb.auth) throw new Error('Parent Firebase SDK nahi mila.');\n    const auth = fb.auth();\n    const user = auth.currentUser;\n    if (!user) throw new Error('Pehle Dosto ka Chat mein login karo.');\n    const db = fb.database();\n    return {\n      join: async function (roomName, isHost) {\n        const code = String(roomName || '').replace(/^dosto-/, '').toLowerCase();\n        if (!/^[a-z0-9]{3,12}$/.test(code)) throw new Error('Room code galat hai.');\n        const ref = db.ref('showdownRooms/' + code);\n        const uid = user.uid;\n        const initial = await ref.transaction(function (current) {\n          if (isHost) {\n            if (current) return;\n            return { host: uid, status: 'lobby', createdAt: fb.database.ServerValue.TIMESTAMP, players: { [uid]: { joinedAt: fb.database.ServerValue.TIMESTAMP, presence: { role: 'host' } } } };\n          }\n          if (!current || current.status !== 'lobby') return;\n          current.players = current.players || {};\n          if (current.players[uid]) return current;\n          if (current.guest && current.guest !== uid) return;\n          current.guest = uid;\n          current.players[uid] = { joinedAt: fb.database.ServerValue.TIMESTAMP, presence: { role: 'guest' } };\n          return current;\n        });\n        if (!initial.committed) throw new Error(isHost ? 'Ye room code pehle se use ho raha hai. Naya room banao.' : 'Room nahi mila, full hai ya game start ho chuka hai.');\n        const playersRef = ref.child('players');\n        let players = {};\n        const peerListeners = [];\n        const eventListeners = [];\n        let left = false;\n        const peers = () => Object.keys(players || {}).map(id => ({ isMe: id === uid, uid: id, presence: players[id] && players[id].presence || {} }));\n        const room = {\n          peers,\n          presence: async data => {\n            if (left) return;\n            await playersRef.child(uid).update({ presence: data, lastSeen: fb.database.ServerValue.TIMESTAMP });\n          },\n          onPeers: callback => {\n            const fn = snap => { players = snap.val() || {}; callback(); };\n            playersRef.on('value', fn);\n            peerListeners.push(() => playersRef.off('value', fn));\n            return () => { playersRef.off('value', fn); };\n          },\n          on: (event, callback) => {\n            const eventRef = ref.child('events/' + event);\n            let lastSeq = null;\n            const fn = snap => {\n              const value = snap.val();\n              if (!value || value.sender === uid || value.seq === lastSeq) return;\n              lastSeq = value.seq;\n              callback({ isMe: false, data: value.data });\n            };\n            let actQuery = null, actFn = null;\n            if (event === 'act') {\n              actQuery = eventRef.limitToLast(30);\n              actFn = snap => {\n                const value = snap.val();\n                if (value && value.sender !== uid) callback({ isMe: false, data: value.data });\n              };\n              actQuery.on('child_added', actFn);\n            } else eventRef.on('value', fn);\n            const off = () => {\n              if (actQuery) actQuery.off('child_added', actFn);\n              else eventRef.off('value', fn);\n            };\n            eventListeners.push(off);\n            return off;\n          },\n          emit: async (event, data) => {\n            if (left) return;\n            const value = { sender: uid, seq: Date.now() + '-' + Math.random().toString(36).slice(2), data: data };\n            if (event === 'act') await ref.child('events/act').push(value);\n            else await ref.child('events/' + event).set(value);\n          },\n          leave: async () => {\n            if (left) return;\n            left = true;\n            peerListeners.concat(eventListeners).forEach(fn => { try { fn(); } catch (_) {} });\n            if (isHost) await ref.remove();\n            else await ref.update({ ['players/' + uid]: null, guest: null });\n          }\n        };\n        players = (initial.snapshot.val() && initial.snapshot.val().players) || {};\n        try {\n          if (isHost) ref.onDisconnect().remove();\n          else playersRef.child(uid).onDisconnect().remove();\n        } catch (_) {}\n        return room;\n      }\n    };\n  }\n};\n</script>\n<script>\nconst $=id=>document.getElementById(id),cv=$('c'),c=cv.getContext('2d'),g=$('g'),R=Math.random,K=.9;\nlet net=null,fxq=[],nacc=0;let arc=false,two=false,ladder=[],ldr=0,mus=null,mstep=0,gpp=[],gm=0,gb=0;let W=640,H=360,GY=288,T=0,scene='menu',slot=0,sel=[0,1],stg=0,df=1,paused=false,mute=false,hs=0,ts=1,tsT=0;\nconst DF=[1.6,1,.55],BP=[.25,.5,.85],DN=['Easy','Normal','Hard'];\nconst CH=[\n{n:'BOSS DIVYA',skin:'#e0ac82',top:'#f59e0b',pants:'#1e293b',hair:'#141414',acc:'phones',h:1,sp:165,sup:'133 Push-Up Boom'},\n{n:'LAMBU AJAY',skin:'#d9a273',top:'#2563eb',pants:'#0f172a',hair:'#2a1a0e',acc:'tall',h:1.17,sp:150,sup:'Sky-Drop Roast'},\n{n:'SHAKUNI MAMA',skin:'#c68a5e',top:'#7c3aed',pants:'#3b0764',hair:'#aaaaaa',acc:'stache',h:.95,sp:172,sup:'Pasa Palat'},\n{n:'MITRAMAN',skin:'#e7b48c',top:'#dc2626',pants:'#18181b',hair:'#e5e7eb',acc:'cape',h:1.05,sp:160,sup:'Mitron Blast'},\n{n:'YATRA BOY',skin:'#e3b08a',top:'#f1f5f9',pants:'#475569',hair:'#222222',acc:'bag',h:1,sp:180,sup:'Padyatra Rush'},\n{n:'BOSS MBAPU',skin:'#8d5a3b',top:'#16a34a',pants:'#052e16',hair:'#000000',acc:'crown',h:1.12,sp:148,sup:'Mega Kursi Slam'}];\nconst ST=[{s:['#1e3a5f','#e08a5a','#ffe8b0'],n:'🌅 Panigaon Adda'},{s:['#0b1030','#5b3a8c','#f08a6b'],n:'🏛️ Sansad Bhavan'},{s:['#02030a','#0f1b33','#3a4a66'],n:'🌃 Jantar Sadak'}];\n/* ---------- audio (synth) ---------- */\nlet AC,crn;const AX=()=>AC=AC||new(window.AudioContext||window.webkitAudioContext)();\nfunction osc(f,d,ty='square',v=.07,s=1,dl=0){if(mute)return;try{const a=AX(),t=a.currentTime+dl,o=a.createOscillator(),q=a.createGain();o.type=ty;o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,f*s),t+d);q.gain.setValueAtTime(v,t);q.gain.exponentialRampToValueAtTime(.001,t+d);o.connect(q).connect(a.destination);o.start(t);o.stop(t+d)}catch(e){}}\nfunction nz(d,fr,v,ty='bandpass',fe=0,dl=0){if(mute)return;try{const a=AX(),t=a.currentTime+dl,n=a.sampleRate*d|0,b=a.createBuffer(1,n,a.sampleRate),x=b.getChannelData(0);for(let i=0;i<n;i++)x[i]=R()*2-1;const s=a.createBufferSource(),f=a.createBiquadFilter(),q=a.createGain();s.buffer=b;f.type=ty;f.frequency.setValueAtTime(fr,t);if(fe)f.frequency.exponentialRampToValueAtTime(fe,t+d);q.gain.setValueAtTime(v,t);q.gain.exponentialRampToValueAtTime(.001,t+d);s.connect(f).connect(q).connect(a.destination);s.start(t)}catch(e){}}\nfunction voice(f0,f1,d,v,dl=0){if(mute)return;try{const a=AX(),t=a.currentTime+dl,o=a.createOscillator(),fl=a.createBiquadFilter(),q=a.createGain();o.type='sawtooth';o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(f1,t+d);fl.type='bandpass';fl.Q.value=4;fl.frequency.setValueAtTime(700,t);fl.frequency.linearRampToValueAtTime(1200,t+d*.6);q.gain.setValueAtTime(v,t);q.gain.exponentialRampToValueAtTime(.001,t+d);o.connect(fl).connect(q).connect(a.destination);o.start(t);o.stop(t+d)}catch(e){}}\nconst sfx={\n punch(){nz(.14,2200,.1,'bandpass',600)},kick(){nz(.2,1400,.13,'bandpass',300)},\n hit(h){nz(.12,700,.3,'lowpass',120);osc(150,.16,'sine',h?.4:.25,.3);if(h)nz(.35,300,.25,'lowpass',60)},\n block(){osc(1200,.1,'triangle',.1,.6);nz(.1,5000,.08,'highpass')},\n jump(){osc(260,.14,'sine',.05,2)},\n charge(){osc(70,.45,'sawtooth',.08,10);osc(72,.45,'square',.04,10);nz(.45,300,.1,'bandpass',3000);voice(190,120,.4,.06)},\n boom(){osc(170,1,'sine',.5,.15);nz(.8,1500,.4,'lowpass',80);[1200,1800,2700].forEach((f,i)=>osc(f,.9,'triangle',.07,.5,i*.02));voice(260,150,.6,.18);nz(.5,6000,.1,'highpass',1500)},\n ko(){osc(110,.9,'sine',.3,.2);nz(.5,400,.2,'lowpass',60)},\n bell(){osc(880,.9,'triangle',.12,.98);osc(1320,.7,'sine',.05)},\n drop(){osc(90,.3,'sawtooth',.2,.4);nz(.3,400,.2,'lowpass',80)}};\nfunction crowd(){music(0);try{if(crn){crn.stop();crn=null}if(mute||scene!=='fight')return;music(1);const a=AX(),n=a.sampleRate*2,b=a.createBuffer(1,n,a.sampleRate),x=b.getChannelData(0);let l=0;for(let i=0;i<n;i++){l=l*.97+(R()*2-1)*.03;x[i]=l*5}const s=a.createBufferSource(),f=a.createBiquadFilter(),q=a.createGain();s.buffer=b;s.loop=true;f.type='bandpass';f.frequency.value=500;q.gain.value=.05;s.connect(f).connect(q).connect(a.destination);s.start();crn=s}catch(e){}}\n/* ---------- character renderer ---------- */\nconst hx=h=>[1,3,5].map(i=>parseInt(h.substr(i,2),16));\nconst sh=(h,a)=>{const[r,g,b]=hx(h),f=v=>Math.max(0,Math.min(255,Math.round(a>0?v+(255-v)*a:v*(1+a))));return`rgb(${f(r)},${f(g)},${f(b)})`};\nconst ez=q=>1-(1-q)*(1-q)*(1-q);\nfunction ac(p){if(p<.2)return -.35*Math.sin(p/.2*Math.PI/2);if(p<.45)return -.35+1.35*ez((p-.2)/.25);const q=(p-.45)/.55;return 1-q*q}\nfunction seg(c,x,y,a,l,w,col){const nx=x+Math.sin(a)*l,ny=y+Math.cos(a)*l;c.lineCap='round';c.strokeStyle='rgba(0,0,0,.5)';c.lineWidth=w+2;c.beginPath();c.moveTo(x,y);c.lineTo(nx,ny);c.stroke();c.strokeStyle=col;c.lineWidth=w;c.stroke();c.strokeStyle='rgba(255,255,255,.2)';c.lineWidth=w*.28;c.beginPath();c.moveTo(x+w*.2,y);c.lineTo(nx+w*.2,ny);c.stroke();return[nx,ny]}\nconst legY=a=>32*(Math.cos(a[0])+Math.cos(a[1]));\nfunction leg(c,x,y,a,col){const k=seg(c,x,y,a[0],32,15,col),f=seg(c,k[0],k[1],a[1],32,12.5,col);c.fillStyle='#1a1a1a';c.beginPath();c.ellipse(f[0]+5,f[1]+2,12,6,0,0,7);c.fill();c.fillStyle='#e5e7eb';c.fillRect(f[0]-6,f[1]+6,22,2.5)}\nfunction arm(c,x,y,a,h,gl,dk){const e=seg(c,x,y,a[0],24,11.5,dk?sh(h.top,-.25):h.top),w=seg(c,e[0],e[1],a[1],22,9,dk?sh(h.skin,-.25):h.skin);c.fillStyle=gl||(dk?sh(h.skin,-.25):h.skin);c.beginPath();c.arc(w[0],w[1],7.5,0,7);c.fill();c.strokeStyle='#0004';c.lineWidth=1;c.stroke();c.strokeStyle='#0003';c.beginPath();c.moveTo(w[0]-3,w[1]-3);c.lineTo(w[0]+3,w[1]-3);c.stroke()}\nfunction pose(f,t){\n const st=f.st,p=f.p,ph=ac(p),br=Math.sin(t*3),bn=Math.sin(t*5.5)*.07,P={fl:[.35,.1],bl:[-.3,-.15],fa:[.55,1.95],ba:[.25,1.75],lean:0,tx:0,hd:0};\n if(st==='idle'){P.fl=[.38+bn,.1-bn];P.bl=[-.32-bn,-.18+bn];P.fa=[.55+br*.05,1.95];P.ba=[.28,1.78+br*.05];P.lean=.03+br*.01}\n else if(st==='walk'){const s=Math.sin(f.wk),k=Math.cos(f.wk);P.fl=[.1+s*.75,.1+Math.max(0,-k)*.7];P.bl=[.1-s*.75,.1+Math.max(0,k)*.7];P.fa=[.5-s*.2,1.9];P.ba=[.3+s*.2,1.8];P.lean=.08}\n else if(st==='jump'){const up=f.vy>0;P.fl=up?[1.0,-.4]:[.5,.1];P.bl=up?[-.1,-.9]:[-.5,-.1];P.fa=[.9,2.2];P.ba=[.7,2.0]}\n else if(st==='punch'){const a=f.alt?'ba':'fa',s=[.55+.95*ph,1.95-.43*ph];P[a]=s;if(f.alt)P.fa=[.7,2.1];P.lean=.14*ph;P.tx=5*ph;P.fl=[.38+.3*ph,.1];P.bl=[-.32-.12*ph,-.15]}\n else if(st==='kick'){const w=Math.max(0,-ph/.35),s=Math.max(0,ph);P.fl=[.35+.55*w+1.0*s,.35-.65*w+1.15*s];P.bl=[-.12,-.1];P.lean=-.22*s+.05*w;P.fa=[.1,1.3];P.ba=[-.5,1.1];P.tx=-4*s}\n else if(st==='upper'){P.fa=[.55+2.1*ph,1.95+.6*ph];P.lean=.1*ph;P.fl=[.4+.3*ph,.1];P.tx=4*ph}\n else if(st==='sweep'){const q=Math.max(0,Math.min(1,ph+.35));P.bl=[-1.0*q-.3,1.2*q-.1];P.fl=[.35+1.0*q,.35+1.1*q];P.lean=.15*q;P.fa=[.3,1.4];P.ba=[-.5,1.0]}\n else if(st==='block'){P.fa=[.95,2.75];P.ba=[.75,2.6];P.fl=[.5,.35];P.bl=[-.45,-.1];P.lean=.08}\n else if(st==='hit'){const r=Math.max(0,1-p*3.5);P.lean=-.4*r;P.hd=-.4*r;P.fa=[-.3*r+.4,.2];P.ba=[-.6*r,.2];P.fl=[.15,.1];P.bl=[-.55,-.1];P.tx=-8*r}\n else if(st==='super'){if(p<.4){const q=p/.4;P.fl=[.7*q+.3,.35*q];P.bl=[-.7*q-.3,-.3*q];P.fa=[-.6*q+.5,2.2];P.ba=[-.7*q+.2,2.3];P.lean=-.12*q}else{P.fl=[.95,.5];P.bl=[-.5,-.3];P.fa=[1.5,1.52];P.ba=[1.4,1.5];P.lean=.26}}\n else if(st==='win'){P.fa=[2.7,2.9];P.ba=[2.5,2.8];P.fl=[.3,.1];P.bl=[-.3,-.1];P.hd=-.15}\n else if(st==='ko'){P.fa=[-.3,-.1];P.ba=[-.5,-.2];P.fl=[.1,.1];P.bl=[-.4,-.1]}\n return P}\nfunction drawF(c,f,x,y,t){\n const h=f.ch,s=h.h*K,P=pose(f,t),st=f.st,hy=-Math.max(legY(P.fl),legY(P.bl))-(st==='idle'?Math.sin(t*5.5)*1.2:0),sy=hy-48,hd=sy-23,blink=Math.sin(t*1.7+h.sp)>.985;\n const sk=h.skin,sD=sh(sk,-.25),top=h.top;\n const sg=c.createRadialGradient(x,y,2,x,y,44*s);sg.addColorStop(0,'rgba(0,0,0,.55)');sg.addColorStop(1,'rgba(0,0,0,0)');c.save();c.translate(0,0);c.scale(1,.22);c.fillStyle=sg;c.globalAlpha=1-Math.min(.7,f.j/250);c.beginPath();c.arc(x,y/.22,44*s,0,7);c.fill();c.restore();\n c.save();c.translate(x,y-f.j);c.scale(f.dir*s,s);\n if(st==='ko'){const q=Math.min(1,f.p*2.5);c.rotate(-1.5*q);c.translate(0,q*8)}\n if(st==='super'||f.sh>=100){const al=st==='super'?.5:.2;c.globalAlpha=al+.15*Math.sin(t*14);const ag=c.createRadialGradient(0,-80,5,0,-80,90);ag.addColorStop(0,'#fff6c8');ag.addColorStop(.4,'#f59e0b');ag.addColorStop(1,'rgba(245,158,11,0)');c.fillStyle=ag;c.beginPath();c.arc(0,-80,90+(st==='super'?20*Math.sin(t*20):0),0,7);c.fill();c.globalAlpha=1}\n c.translate(P.tx,0);c.translate(0,hy);c.rotate(P.lean);c.translate(0,-hy);\n if(h.acc==='cape'){const w=Math.sin(t*6)*3+(st==='walk'?10:2);c.fillStyle='#7f1d1d';c.beginPath();c.moveTo(-8,sy+2);c.quadraticCurveTo(-40-w,sy+30,-30-w*1.5,hy+14);c.lineTo(-6,hy-4);c.fill();c.fillStyle='#0003';c.fill()}\n if(h.acc==='bag'){c.fillStyle='#0369a1';c.beginPath();c.roundRect(-27,sy+2,19,40,6);c.fill();c.fillStyle='#38bdf8';c.fillRect(-25,sy+16,15,4)}\n const gl=h.acc==='crown'?'#fbbf24':null;\n leg(c,-5,hy,P.bl,sh(h.pants,-.3));arm(c,-4,sy+4,P.ba,h,gl,1);\n const tg=c.createLinearGradient(-14,0,15,0);tg.addColorStop(0,sh(top,-.35));tg.addColorStop(.55,top);tg.addColorStop(1,sh(top,.2));\n c.fillStyle=tg;c.beginPath();c.moveTo(-14,sy+4);c.quadraticCurveTo(0,sy-5,15,sy+4);c.lineTo(12,hy-2);c.lineTo(-12,hy-2);c.closePath();c.fill();c.strokeStyle='#0006';c.lineWidth=1.2;c.stroke();\n c.strokeStyle='#0002';c.lineWidth=1;for(let i=0;i<3;i++){c.beginPath();c.moveTo(-8+i*8,sy+14);c.quadraticCurveTo(-5+i*8,sy+26,-9+i*8,hy-8);c.stroke()}\n c.fillStyle=sh(h.pants,-.2);c.fillRect(-12,hy-9,24,8);c.fillStyle='#fbbf24';c.fillRect(0,hy-8,5,5);\n if(h.acc==='phones'){c.strokeStyle='#fff8';c.lineWidth=1.5;c.beginPath();c.moveTo(2,sy+6);c.lineTo(2,hy-10);c.stroke();c.fillStyle='#111';c.font='bold 8px monospace';c.fillText('</>',-6,sy+24)}\n if(h.acc==='stache'){c.fillStyle='#facc15';for(let i=0;i<3;i++){c.beginPath();c.arc(4,sy+10+i*10,1.8,0,7);c.fill()}}\n if(h.acc==='cape'){c.strokeStyle='#fff9';c.lineWidth=2;c.beginPath();c.moveTo(-3,sy+3);c.lineTo(1,sy+14);c.lineTo(5,sy+3);c.stroke()}\n if(h.acc==='bag'){c.strokeStyle='#0369a1';c.lineWidth=4;c.beginPath();c.moveTo(-9,sy+3);c.lineTo(8,hy-6);c.stroke()}\n if(h.acc==='crown'){c.strokeStyle='#fbbf24';c.lineWidth=3;c.beginPath();c.arc(1,sy+4,11,.1,3);c.stroke();c.fillStyle='#fbbf24';c.beginPath();c.arc(1,sy+16,3.5,0,7);c.fill()}\n if(h.acc==='tall'){c.fillStyle='#ffffff55';c.fillRect(-12,sy+16,24,3);c.fillRect(-12,sy+28,24,3)}\n leg(c,5,hy,P.fl,h.pants);\n c.save();c.translate(3,hd);c.rotate(P.hd);c.translate(-3,-hd);\n seg(c,2,sy+3,0,-9,9,sD);\n if(h.acc==='tall'){c.fillStyle=h.hair;for(let i=0;i<5;i++){c.beginPath();c.moveTo(-15+i*8,hd-10);c.lineTo(-12+i*8,hd-30-(i%2)*5);c.lineTo(-5+i*8,hd-10);c.fill()}}\n const hg=c.createRadialGradient(8,hd-4,3,3,hd,19);hg.addColorStop(0,sh(sk,.2));hg.addColorStop(1,sD);c.fillStyle=hg;c.beginPath();c.ellipse(3,hd,16,18,0,0,7);c.fill();c.strokeStyle='#0005';c.lineWidth=1;c.stroke();\n c.fillStyle=sD;c.beginPath();c.ellipse(-8,hd+2,4,5.5,0,0,7);c.fill();\n if(h.acc==='crown'||h.acc==='bag'||h.acc==='stache'){c.fillStyle='rgba(0,0,0,.22)';c.beginPath();c.ellipse(4,hd+7,14,11,0,0,3.1);c.fill()}\n const hair=c.createLinearGradient(0,hd-20,0,hd);hair.addColorStop(0,sh(h.hair,.15));hair.addColorStop(1,h.hair);c.fillStyle=hair;c.beginPath();c.ellipse(1,hd-4,18.5,16,0,Math.PI*.98,Math.PI*2.1);c.fill();\n c.strokeStyle='#ffffff22';c.lineWidth=1;for(let i=0;i<4;i++){c.beginPath();c.arc(1,hd-4,17-i*2.5,Math.PI*1.1+i*.1,Math.PI*1.8);c.stroke()}\n const hurt=st==='hit'||st==='ko';\n if(blink||hurt){c.strokeStyle='#111';c.lineWidth=1.8;c.beginPath();c.moveTo(7,hd-1);c.lineTo(15,hd-1);c.stroke()}else{c.fillStyle='#fff';c.beginPath();c.ellipse(11,hd-1,4.6,3.6,0,0,7);c.fill();c.fillStyle='#3b2412';c.beginPath();c.arc(12.6,hd-1,2.4,0,7);c.fill();c.fillStyle='#000';c.beginPath();c.arc(13,hd-1,1.2,0,7);c.fill();c.fillStyle='#fff';c.fillRect(12.2,hd-2.2,1,1)}\n c.strokeStyle='#111';c.lineWidth=2.4;c.beginPath();c.moveTo(5,hd-7);c.lineTo(16,hd-(hurt?10:5)-(f.atk?2:0));c.stroke();\n c.fillStyle=sk;c.beginPath();c.moveTo(17,hd-1);c.quadraticCurveTo(23,hd+4,17,hd+6);c.fill();c.strokeStyle='#0004';c.lineWidth=1;c.stroke();\n if(f.atk||hurt||st==='super'||st==='win'){c.fillStyle='#4a0d0d';c.beginPath();c.ellipse(11,hd+11,4,st==='win'?4:3,0,0,7);c.fill();c.fillStyle='#fff';c.fillRect(8,hd+8.5,6,1.5)}else{c.strokeStyle='#5a2b1a';c.lineWidth=1.6;c.beginPath();c.moveTo(7,hd+11);c.quadraticCurveTo(11,hd+12,15,hd+10.5);c.stroke()}\n if(h.acc==='phones'){c.strokeStyle='#e5e7eb';c.lineWidth=3;c.beginPath();c.arc(1,hd-3,19,3.4,6.1);c.stroke();c.fillStyle='#f59e0b';c.beginPath();c.ellipse(-8,hd+2,6,7.5,0,0,7);c.fill();c.strokeStyle='#0006';c.lineWidth=1;c.stroke()}\n if(h.acc==='stache'){c.strokeStyle='#d4d4d8';c.lineWidth=4;c.beginPath();c.moveTo(10,hd+7);c.quadraticCurveTo(19,hd+4,25,hd+10);c.moveTo(10,hd+7);c.quadraticCurveTo(15,hd+13,7,hd+12);c.stroke();c.fillStyle='#a1a1aa';c.beginPath();c.ellipse(-4,hd-8,6,5,0,0,7);c.fill()}\n if(h.acc==='cape'){c.fillStyle='#050505';c.beginPath();c.roundRect(6,hd-6,16,6,2);c.fill();c.fillStyle='#ffffff44';c.fillRect(8,hd-5,5,1.5)}\n if(h.acc==='bag'){c.fillStyle='#dc2626';c.beginPath();c.ellipse(1,hd-4,18.6,15,0,Math.PI,Math.PI*2);c.fill();c.fillRect(8,hd-6,17,4);c.fillStyle='#fff';c.fillRect(-3,hd-14,5,3)}\n if(h.acc==='crown'){c.fillStyle='#fbbf24';c.beginPath();c.moveTo(-11,hd-14);c.lineTo(-8,hd-28);c.lineTo(-1,hd-18);c.lineTo(4,hd-30);c.lineTo(9,hd-18);c.lineTo(15,hd-28);c.lineTo(16,hd-14);c.closePath();c.fill();c.strokeStyle='#92400e';c.lineWidth=1;c.stroke();c.fillStyle='#ef4444';c.beginPath();c.arc(4,hd-20,2,0,7);c.fill()}\n c.restore();\n arm(c,4,sy+4,P.fa,h,gl,0);\n if(f.atk&&f.p>.22&&f.p<.62&&f.atk!=='super'){c.globalAlpha=.6*(1-Math.abs(f.p-.42)/.2);c.strokeStyle=f.atk==='kick'?'#fff':'#fde68a';c.lineWidth=f.atk==='kick'?7:4;c.beginPath();c.arc(8,hy-30,f.atk==='kick'?68:56,-.7,.45);c.stroke();c.globalAlpha=1}\n c.restore()}\n/* ---------- stages ---------- */\nfunction stage(){\n const S=ST[stg],gr=c.createLinearGradient(0,0,0,GY);S.s.forEach((k,i)=>gr.addColorStop(i/2,k));c.fillStyle=gr;c.fillRect(-90,-60,W+180,GY+60);\n const sx=W*.72,sy=GY-95,sg=c.createRadialGradient(sx,sy,2,sx,sy,170);sg.addColorStop(0,stg?'rgba(210,225,255,.95)':'rgba(255,244,200,1)');sg.addColorStop(.12,stg===1?'rgba(255,190,150,.5)':stg?'rgba(160,190,255,.3)':'rgba(255,200,120,.5)');sg.addColorStop(1,'rgba(255,200,120,0)');c.fillStyle=sg;c.fillRect(-90,0,W+180,GY);\n if(stg)for(let i=0;i<50;i++){c.fillStyle=`rgba(255,255,255,${.4+.4*Math.sin(T*2+i)})`;c.fillRect((i*97)%W,(i*53)%(GY-150),1.4,1.4)}\n c.save();c.translate((W/2-cam.x)*.1,0);\n c.fillStyle='rgba(255,255,255,.12)';for(let i=0;i<4;i++){c.beginPath();c.ellipse(((T*6+i*190)%(W+260))-90,50+i*32,60,11,0,0,7);c.fill()}\n for(let L=0;L<2;L++){c.fillStyle=stg===2?(L?'#0c1426':'#141f38'):stg?(L?'#2a1a4a':'#4a2f70'):(L?'#2f5a45':'#6a8a8a');c.beginPath();c.moveTo(-90,GY);for(let x=-90;x<=W+90;x+=12)c.lineTo(x,GY-60-L*-0-(L?25:55)-Math.sin(x/(60-L*20)+L*2)*22-Math.sin(x/17)*4);c.lineTo(W+90,GY);c.fill()}\n c.restore();\n c.save();c.translate((W/2-cam.x)*.2,0);\n if(stg===0){for(let i=0;i<9;i++){const x=-60+i*88;c.fillStyle='#4a2c12';c.fillRect(x-3,GY-70,7,52);const tg=c.createRadialGradient(x-6,GY-92,4,x,GY-80,32);tg.addColorStop(0,'#4ade80');tg.addColorStop(1,'#14532d');c.fillStyle=tg;c.beginPath();c.arc(x,GY-82,27,0,7);c.arc(x+16,GY-74,20,0,7);c.arc(x-16,GY-72,18,0,7);c.fill()}\n  c.fillStyle='#c08a4a';c.fillRect(W-190,GY-70,110,52);c.fillStyle='#6b2d12';c.beginPath();c.moveTo(W-200,GY-70);c.lineTo(W-135,GY-108);c.lineTo(W-70,GY-70);c.fill();c.fillStyle='#fde047';c.fillRect(W-160,GY-54,26,24);c.fillStyle='#ffffff';c.fillRect(W-115,GY-46,22,28)}\n if(stg===1){const bw=W*.66,bx=W/2-bw/2,bg=c.createLinearGradient(0,GY-150,0,GY);bg.addColorStop(0,'#f5e6d0');bg.addColorStop(1,'#b89a7a');c.fillStyle=bg;c.fillRect(bx,GY-130,bw,130);c.beginPath();c.ellipse(W/2,GY-130,78,70,0,Math.PI,0);c.fill();c.fillStyle='#8a6d52';c.fillRect(bx-8,GY-136,bw+16,8);\n  for(let i=0;i<13;i++){const x=bx+8+i*(bw-16)/12;c.fillStyle='#e8d5b8';c.fillRect(x-6,GY-120,12,112);c.fillStyle='#0003';c.fillRect(x+2,GY-120,4,112);c.fillStyle='#fde68a';if(i%2)c.fillRect(x-14,GY-60,5,12)}\n  c.fillStyle='#fb923c';c.fillRect(W/2-1,GY-215,2,32);c.fillRect(W/2+1,GY-215,16,10)}\n if(stg===2){for(let i=0;i<9;i++){const bh=100+(i*61)%100,x=-50+i*84;c.fillStyle='#111a2e';c.fillRect(x,GY-bh,80,bh);for(let j=0;j<bh/16;j++)for(let k=0;k<4;k++)if((i*3+j*k+j)%3){c.fillStyle=(j+k+i)%5?'#fde68a':'#7dd3fc';c.globalAlpha=.8;c.fillRect(x+8+k*18,GY-bh+8+j*16,9,8)}c.globalAlpha=1}\n  for(let i=0;i<5;i++){const x=40+i*150;c.fillStyle='#222';c.fillRect(x,GY-80,3,80);const lg=c.createRadialGradient(x+1,GY-80,1,x+1,GY-30,70);lg.addColorStop(0,'rgba(255,220,130,.55)');lg.addColorStop(1,'rgba(255,220,130,0)');c.fillStyle=lg;c.beginPath();c.moveTo(x+1,GY-80);c.lineTo(x-50,GY);c.lineTo(x+52,GY);c.fill()}}\n c.restore();\n const fg=c.createLinearGradient(0,GY-60,0,GY);fg.addColorStop(0,'rgba(255,255,255,0)');fg.addColorStop(1,stg===2?'rgba(120,150,200,.25)':'rgba(255,230,200,.3)');c.fillStyle=fg;c.fillRect(-90,GY-60,W+180,60);\n c.fillStyle=stg===1?'#120d2a':'#00000066';for(let r=0;r<2;r++)for(let i=0;i<26;i++){const x=i*26+r*13-5,y=GY-5+r*3-Math.abs(Math.sin(T*3+i*1.3+r))*(5+r*3),hr=8+(i%3);c.beginPath();c.arc(x,y-4,hr,0,7);c.fill();c.fillRect(x-hr,y-4,hr*2,16);if((i+r)%4===0){c.fillRect(x+hr-2,y-18-Math.sin(T*6+i)*4,3,14)}}\n const g2=c.createLinearGradient(0,GY,0,H);const gc=[['#8a5a2b','#2f1b0b'],['#7b8394','#1a2030'],['#3a4558','#0a0f1a']][stg];g2.addColorStop(0,gc[0]);g2.addColorStop(1,gc[1]);c.fillStyle=g2;c.fillRect(-90,GY,W+180,H-GY+60);\n c.strokeStyle='rgba(255,255,255,.08)';c.lineWidth=1;for(let i=-12;i<13;i++){c.beginPath();c.moveTo(W/2+i*30,GY);c.lineTo(W/2+i*110,H+40);c.stroke()}for(let i=1;i<6;i++){c.beginPath();c.moveTo(-90,GY+i*i*3.2);c.lineTo(W+90,GY+i*i*3.2);c.stroke()}\n const pl=c.createRadialGradient((P.x+E.x)/2,GY+14,5,(P.x+E.x)/2,GY+14,190);pl.addColorStop(0,stg?'rgba(160,190,255,.22)':'rgba(255,220,150,.3)');pl.addColorStop(1,'rgba(0,0,0,0)');c.save();c.translate(0,GY+14);c.scale(1,.2);c.translate(0,-(GY+14));c.fillStyle=pl;c.fillRect(-90,GY-300,W+180,700);c.restore();\n if(stg===0){c.fillStyle='rgba(255,230,160,.07)';for(let i=0;i<3;i++){c.beginPath();c.moveTo(sx,sy);c.lineTo(sx-260-i*70,GY);c.lineTo(sx-190-i*70,GY);c.fill()}}\n if(stg===2){c.strokeStyle='rgba(190,210,255,.4)';c.lineWidth=1;c.beginPath();for(let i=0;i<80;i++){const x=(i*37+T*90)%(W+120)-60,y=(i*91+T*520)%(H+40)-20;c.moveTo(x,y);c.lineTo(x-4,y+14)}c.stroke();if(Math.sin(T*.8)>.996)flash=Math.max(flash,.3)}\n c.fillStyle='rgba(255,255,255,.35)';for(let i=0;i<30;i++){c.fillRect((i*83+T*(8+i%5))%W,(i*47+Math.sin(T+i)*10)%GY,1.6,1.6)}}\n/* ---------- game state ---------- */\nlet P,E,rd,rs,rt,tm,parts=[],txts=[],projs=[],rings=[],shake=0,flash=0,bn={t:0,s:''},ai={cd:0,bt:0,mv:0},cam={x:320,z:1};\nconst inp2={l:0,r:0,mag:1,block:0,dn:0,up:0,punch:0,kick:0,sup:0,assist:0};const inp={dn:0,l:0,r:0,mag:0,block:0,up:0,punch:0,kick:0,sup:0,assist:0};\nconst mk=(ci,x,d)=>({ci,ch:CH[ci],x,dir:d,j:0,vy:0,vx:0,hp:1000,hl:1000,sh:0,as:0,st:'idle',p:0,dur:1,stun:0,wk:0,w:0,combo:0,ct:0,atk:null,alt:0,dust:0});\nfunction say(t){if(mute)return;try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(t);u.rate=1.1;u.pitch=.8;speechSynthesis.speak(u)}catch(e){}}\nfunction music(on){clearInterval(mus);mus=null;if(!on||mute||scene!=='fight')return;const bs=[55,55,65,55,73,55,65,82];mus=setInterval(()=>{if(paused||scene!=='fight')return;const q=mstep++%16,hi=P&&(P.hp<300||E.hp<300);if(q%4===0)osc(90,.15,'sine',.12,.3);if(q%8===4)nz(.1,1800,.06,'bandpass');if(q%2)nz(.04,7000,.025,'highpass');if(q%2===0)osc(bs[(q>>1)%8]*(hi?1.5:1),.2,'sawtooth',.04,.98)},hi_()?110:150)}\nconst hi_=()=>P&&(P.hp<300||E.hp<300);\nfunction banner(s,t=1.6){bn={s,t,m:t};say(s);if(net&&net.host)fxq.push(['n',s,t])}\nfunction spark(x,y,col,n=8){for(let i=0;i<n;i++)parts.push({x,y,vx:(R()-.5)*320,vy:(R()-.5)*320,l:.45,c:col,s:3})}\nfunction dust(x,n=4){for(let i=0;i<n;i++)parts.push({x:x+(R()-.5)*20,y:GY-2,vx:(R()-.5)*60,vy:-20-R()*30,l:.6,c:'rgba(210,195,165,.5)',s:5+R()*4,d:1})}\nfunction txt(x,y,s,col){txts.push({x,y,s,col,l:.9})}\nfunction start(k){if(net&&!k)netLeave();if(two)arc=false;if(arc&&!k){ladder=[...CH.keys()].filter(i=>i!==sel[0]).sort((a,b)=>(a===5)-(b===5));ldr=0;sel[1]=ladder[0]}scene='fight';$('menu').classList.add('hid');$('res').classList.add('hid');$('ctl').classList.remove('hid');P=mk(sel[0],W*.35,1);E=mk(sel[1],W*.65,-1);rd=1;paused=false;if(net&&!net.host){rs='intro';tm=60}else newRound();try{AX().resume()}catch(e){}crowd();size()}\nfunction newRound(){for(const[f,x]of[[P,W*.35],[E,W*.65]])Object.assign(f,{x,hp:1000,hl:1000,sh:0,as:0,st:'idle',atk:null,stun:0,j:0,vy:0,vx:0,p:0,combo:0});projs=[];rs='intro';rt=1.9;tm=60;banner('ROUND '+rd,1.3);sfx.bell()}\nfunction toMenu(){scene='menu';crowd();$('res').classList.add('hid');$('ctl').classList.add('hid');$('menu').classList.remove('hid')}\nfunction go(f,a,d,dm,rc,kb){f.atk=a;f.st=a;f.p=0;f.dur=d;f.dm=dm;f.rc=rc;f.kb=kb;f.hit=0;f.sb=0;if(net&&net.host)fxq.push(['w',a]);if(a==='punch')f.alt=!f.alt;sfx[a==='super'?'charge':a]&&sfx[a==='super'?'charge':a]()}\nfunction grav(f,dt){if(f.j>0||f.vy>0){f.j+=f.vy*dt;f.vy-=1300*dt;if(f.j<=0){if(f.vy<-200)dust(f.x,6);f.j=0;f.vy=0}}}\nfunction hurt(o,f,dm,kb){if(o.st==='ko')return;let bk=0;const sx=o.x-o.dir*14,sy=GY-o.j-100*o.ch.h*K;\n if(o.st==='block'&&f.atk!=='super'&&o.dir*(f.x-o.x)>0){bk=1;dm*=.1;o.vx=f.dir*kb*.3;spark(sx,sy,'#93c5fd');sfx.block();hs=.04}\n else{o.st='hit';o.atk=null;o.stun=.28+dm/500;o.vx=f.dir*kb;o.p=0;f.sh=Math.min(100,f.sh+dm/9);o.sh=Math.min(100,o.sh+dm/14);f.combo++;f.ct=1.3;if(f.combo===3||f.combo===5)say(f.combo+' hit combo!');spark(sx,sy,'#fbbf24',16);spark(sx,sy,'#fff',6);shake=dm>100?16:6;hs=dm>100?.14:.06;sfx.hit(dm>100);navigator.vibrate&&navigator.vibrate(dm>100?40:15);if(o.j===0){if(f.atk==='upper')o.vy=420;else if(f.atk==='sweep')o.vy=170;else if(dm>100)o.vy=260}}\n o.hp-=dm;if(net&&net.host)fxq.push(['h',sx|0,sy|0,Math.round(dm),bk]);txt(sx,sy-20,Math.round(dm),'#fff');\n if(o.hp<=0){o.hp=0;o.st='ko';o.atk=null;o.p=0;o.vx=f.dir*240;o.vy=320;endRound(f)}}\nfunction endRound(w){if(rs!=='play')return;rs='end';rt=2.8;w.w++;const l=w===P?E:P;if(l.st!=='ko'){l.st='ko';l.atk=null;l.p=0;l.vx=0}w.st='win';w.atk=null;banner(tm<=0?'TIME UP':'K.O.!',2.2);ts=.3;tsT=1;sfx.ko();if(net&&net.host)fxq.push(['k'])}\nfunction upd(f,o,i,dt){\n f.dir=o.x>f.x?1:-1;const air=f.j>0;\n if(f.st==='ko'){f.p=Math.min(1,f.p+dt*2);f.x+=f.vx*dt;f.vx*=.92;grav(f,dt);return}\n if(f.st==='win'){grav(f,dt);return}\n if(f.stun>0){f.stun-=dt;f.p+=dt;f.x+=f.vx*dt;f.vx*=.9;if(f.stun<=0)f.st='idle'}\n else if(f.atk){f.p+=dt/f.dur;\n  if(f.atk==='super'){if(f.p<.4){const a=R()*6.28;parts.push({x:f.x+Math.cos(a)*90,y:GY-70+Math.sin(a)*70,vx:-Math.cos(a)*220,vy:-Math.sin(a)*220,l:.4,c:'#fde68a',s:3});if(R()<.3)dust(f.x,1)}\n   else{if(!f.sb){f.sb=1;sfx.boom();if(net&&net.host)fxq.push(['b',f.x|0]);shake=20;flash=.55;ts=.45;tsT=.4;rings.push({x:f.x,r:10,l:.6})}if(f.p<.58)f.x+=f.dir*330*dt}}\n  const w=f.atk==='kick'||f.atk==='sweep'?[.38,.62]:f.atk==='super'?[.5,.72]:[.28,.5];\n  if(!f.hit&&f.p>w[0]&&f.p<w[1]){const dx=(o.x-f.x)*f.dir;if(dx>-10&&dx<f.rc&&Math.abs(o.j-f.j)<80){f.hit=1;hurt(o,f,f.dm,f.kb)}}\n  if(f.p>=1){f.atk=null;f.st='idle'}}\n else{\n  if(i.block&&!air)f.st='block';\n  else{const d=(i.r?1:0)-(i.l?1:0);f.x+=d*f.ch.sp*(i.mag||1)*dt;f.wk+=Math.abs(d)*dt*(f.ch.sp/14);f.st=air?'jump':d?'walk':'idle';\n   if(d&&!air){f.dust-=dt;if(f.dust<=0){f.dust=.18;dust(f.x,1)}}\n   if(i.up&&!air){f.vy=450;sfx.jump();dust(f.x,5)}\n   if(i.sup&&f.sh>=100)f.sh=0,go(f,'super',1.1,240,170,540),banner(f.ch.sup+'!',1.2);\n   else if(i.punch)i.dn?go(f,'upper',.46,85,72,120):go(f,'punch',.34,45,76,160);\n   else if(i.kick)i.dn?go(f,'sweep',.5,60,104,200):go(f,'kick',.5,70,92,240);\n   if(i.assist&&f.as>=100){f.as=0;projs.push({x:o.x,y:-40,o:f,tg:o,t:0})}}}\n f.x=Math.max(34,Math.min(W-34,f.x));grav(f,dt);\n if(rs==='play'){f.as=Math.min(100,f.as+dt*7);f.sh=Math.min(100,f.sh+dt*1.5)}\n f.ct-=dt;if(f.ct<=0)f.combo=0}\nfunction aiThink(f,o,dt){const a=ai,z=rs==='play';a.punch=a.kick=a.up=a.sup=a.assist=false;if(!z){a.l=a.r=a.block=false;return}\n a.cd-=dt;a.bt-=dt;a.block=a.bt>0;const d=Math.abs(o.x-f.x),tw=o.x>f.x?1:-1;\n if(a.cd<=0){a.cd=(.12+R()*.35)*DF[df];\n  if(['punch','kick','super'].includes(o.atk)&&d<150&&R()<BP[df]){a.bt=.5;a.mv=0}\n  else if(d>96)a.mv=tw;else if(d<50&&R()<.3)a.mv=-tw;\n  else{a.mv=0;const r=R();if(f.sh>=100&&d<160)a.sup=true;else if(r<.45)a.punch=true;else if(r<.8)a.kick=true;else if(r<.9)a.up=true;else if(f.as>=100)a.assist=true}}\n a.l=a.mv<0;a.r=a.mv>0;a.mag=1}\nfunction step(rdt){\n if(paused)return;if(tsT>0){tsT-=rdt;if(tsT<=0)ts=1}\n let dt=hs>0?0:rdt*ts;if(hs>0)hs-=rdt;\n bn.t-=rdt;flash-=rdt;\n if(rs==='intro'){rt-=dt;if(rt<.7&&bn.s!=='FIGHT!')banner('FIGHT!',.8);if(rt<=0)rs='play'}\n if(rs==='end'){rt-=rdt;if(rt<=0){if(P.w>=2||E.w>=2)finish();else{rd++;newRound()}}}\n if(rs==='play'){tm-=dt;if(tm<=0){tm=0;endRound(P.hp>=E.hp?P:E)}}\n const z={l:0,r:0,block:0};if(net&&net.host)readRemote();if(!two&&!net)aiThink(E,P,dt);\n upd(P,E,rs==='play'?inp:z,dt);upd(E,P,rs==='play'?(two||net?inp2:ai):z,dt);\n if(dt>0){inp.up=inp.punch=inp.kick=inp.sup=inp.assist=0;inp2.up=inp2.punch=inp2.kick=inp2.sup=inp2.assist=0}\n const dx=E.x-P.x;if(Math.abs(dx)<36&&P.j<30&&E.j<30){const m=(36-Math.abs(dx))/2*(dx>=0?1:-1);P.x-=m;E.x+=m}\n for(const p of projs){p.t+=dt;if(p.t>.55){p.y+=950*dt;if(p.y>=GY-20){p.dead=1;spark(p.x,GY-10,'#fde68a',14);dust(p.x,8);shake=9;sfx.drop();if(net&&net.host)fxq.push(['d',p.x|0]);if(Math.abs(p.tg.x-p.x)<44&&p.tg.j<50)hurt(p.tg,p.o,90,150)}}}\n projs=projs.filter(p=>!p.dead);\n for(const p of parts){p.x+=p.vx*dt;p.y+=p.vy*dt;p.l-=dt;if(p.d)p.s+=dt*14}parts=parts.filter(p=>p.l>0);\n for(const t of txts){t.y-=40*dt;t.l-=dt}txts=txts.filter(t=>t.l>0);\n for(const r of rings){r.r+=520*dt;r.l-=dt}rings=rings.filter(r=>r.l>0);\n for(const f of[P,E])f.hl+=(f.hp-f.hl)*Math.min(1,rdt*3);\n const d=Math.abs(P.x-E.x),tz=Math.min(1.14,Math.max(1,W*.5/(d+130)));cam.z+=(tz-cam.z)*Math.min(1,rdt*4);const hf=W/(2*cam.z);cam.x+=(Math.max(hf,Math.min(W-hf,(P.x+E.x)/2))-cam.x)*Math.min(1,rdt*5);\n meter();if(net&&net.host){nacc+=rdt;if(nacc>=.05){nacc=0;sendSnap()}}}\nfunction finish(){scene='over';crowd();$('ctl').classList.add('hid');$('res').classList.remove('hid');const w=P.w>=2;$('rt').textContent=w?'VICTORY! 🏆':'DEFEAT 😵';$('rt').style.color=w?'#fbbf24':'#f87171';$('rp').textContent=w?CH[sel[0]].n+' ne kursi jeet li!':CH[sel[1]].n+' ne roast kar diya!';\n if(two){$('rt').textContent=w?'P1 WINS! 🏆':'P2 WINS! 🏆';$('rp').textContent=''}\n if(net){const mw=net.host?P.w>=2:E.w>=2;$('rt').textContent=mw?'JEET GAYE! 🏆':'HAAR GAYE 😵';$('rt').style.color=mw?'#fbbf24':'#f87171';$('rp').textContent=(mw?'Tum':'Dost')+' ne kursi jeet li!';$('rem').style.display=net.host?'':'none';if(net.host){sendSnap();setTimeout(sendSnap,300);setTimeout(sendSnap,900)}}else $('rem').style.display='';\n if(w&&arc&&!net){if(ldr<ladder.length-1){ldr++;sel[1]=ladder[ldr];stg=(stg+1)%3;$('rp').textContent+=' Agla: '+CH[sel[1]].n+' ('+(ldr+1)+'/'+ladder.length+')'}else $('rt').textContent='ARCADE CHAMPION 👑'}\n if(w&&!two&&!net){try{const n=+(localStorage.coins||0)+100*(arc?2:1);localStorage.coins=n;$('rp').textContent+=' · 🪙 '+n}catch(e){}}}\n/* ---------- render ---------- */\nconst rr=(x,y,w,h,r,f)=>{c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=f;c.fill()};\nfunction hud(){const y=10,bw=W/2-62;c.textBaseline='alphabetic';\n [[P,0],[E,1]].forEach(([f,k])=>{const x=k?W/2+34:W/2-34-bw,fw=v=>bw*Math.max(0,v)/1000,ax=w=>k?x+bw-w:x;\n  rr(x-3,y-3,bw+6,22,8,'#000d');rr(x,y,bw,16,5,'#1f2937');rr(ax(fw(f.hl)),y,fw(f.hl),16,5,'#fff');\n  const gr=c.createLinearGradient(0,y,0,y+16);gr.addColorStop(0,f.hp<300?'#fca5a5':'#bef264');gr.addColorStop(.5,f.hp<300?'#ef4444':'#22c55e');gr.addColorStop(1,f.hp<300?'#991b1b':'#15803d');rr(ax(fw(f.hp)),y,fw(f.hp),16,5,gr);\n  c.fillStyle='#ffffff30';c.fillRect(ax(fw(f.hp)),y+2,fw(f.hp),4);\n  c.font='800 12px system-ui';c.fillStyle=k?'#fda4af':'#fcd34d';c.textAlign=k?'right':'left';c.fillText(f.ch.n,k?x+bw:x,y+32);\n  rr(k?x+bw-bw*.62:x,y+36,bw*.62,7,3,'#000b');rr(k?x+bw-bw*.62*f.sh/100:x,y+36,bw*.62*f.sh/100,7,3,f.sh>=100?'#fde047':'#f59e0b');\n  rr(k?x+bw-bw*.4:x,y+46,bw*.4,4,2,'#000b');rr(k?x+bw-bw*.4*f.as/100:x,y+46,bw*.4*f.as/100,4,2,'#22d3ee');\n  for(let i=0;i<2;i++){c.fillStyle=i<f.w?'#fbbf24':'#334155';c.beginPath();c.arc(k?x+6+i*14:x+bw-6-i*14,y+31,4.5,0,7);c.fill()}});\n c.fillStyle='#000d';c.beginPath();c.arc(W/2,y+20,23,0,7);c.fill();c.strokeStyle='#f59e0b';c.lineWidth=2.5;c.stroke();\n c.fillStyle=tm<10?'#f87171':'#fff';c.textAlign='center';c.font='900 22px system-ui';c.fillText(Math.ceil(tm),W/2,y+28);\n c.font='800 9px system-ui';c.fillStyle='#fbbf24';c.fillText('ROUND '+rd,W/2,y+54);\n if(P.combo>1){c.font='900 24px system-ui';c.fillStyle='#fbbf24';c.textAlign='left';c.lineWidth=4;c.strokeStyle='#000';c.strokeText(P.combo+' HITS!',16,110);c.fillText(P.combo+' HITS!',16,110)}}\nfunction render(){\n c.save();c.translate(W/2,GY);c.scale(cam.z,cam.z);c.translate(-cam.x,-GY);\n if(shake>.3){c.translate((R()-.5)*shake,(R()-.5)*shake);shake*=.87}\n stage();\n for(const r of rings){c.globalAlpha=r.l*1.4;c.strokeStyle='#fde68a';c.lineWidth=6;c.beginPath();c.ellipse(r.x,GY+4,r.r,r.r*.18,0,0,7);c.stroke();c.strokeStyle='#fff';c.lineWidth=2;c.beginPath();c.ellipse(r.x,GY+4,r.r*.9,r.r*.16,0,0,7);c.stroke()}c.globalAlpha=1;\n for(const f of[P,E].sort((a,b)=>a===P&&P.st==='super'?1:b===E&&E.st==='super'?-1:a.j-b.j))drawF(c,f,f.x,GY,T);\n for(const p of projs){if(p.t<.55){c.fillStyle='#ef444466';c.beginPath();c.ellipse(p.x,GY,28,7,0,0,7);c.fill();c.font='16px serif';c.textAlign='center';c.fillText('❗',p.x,GY-22)}else{c.save();c.translate(p.x,p.y);c.rotate(T*8);c.font='36px serif';c.textAlign='center';c.fillText('📕',0,12);c.restore()}}\n for(const p of parts){c.globalAlpha=Math.min(1,p.l*(p.d?1.4:3));c.fillStyle=p.c;if(p.d){c.beginPath();c.arc(p.x,p.y,p.s,0,7);c.fill()}else c.fillRect(p.x,p.y,p.s,p.s)}c.globalAlpha=1;\n c.textAlign='center';c.font='900 18px system-ui';for(const t of txts){c.globalAlpha=Math.min(1,t.l*2);c.lineWidth=3;c.strokeStyle='#000';c.strokeText(t.s,t.x,t.y);c.fillStyle=t.col;c.fillText(t.s,t.x,t.y)}c.globalAlpha=1;\n c.restore();\n const vg=c.createRadialGradient(W/2,H/2,H*.45,W/2,H/2,W*.62);vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,.55)');c.fillStyle=vg;c.fillRect(0,0,W,H);\n if(flash>0){c.fillStyle='rgba(255,230,150,'+Math.min(.8,flash)+')';c.fillRect(0,0,W,H)}\n if(ts<1){c.fillStyle='rgba(120,160,255,.07)';c.fillRect(0,0,W,H)}\n hud();\n if(bn.t>0){const k=Math.min(1,(bn.m-bn.t)*6),sc=1.6-.6*k;c.save();c.translate(W/2,H*.4);c.scale(sc,sc);c.globalAlpha=Math.min(1,bn.t*4);c.font='900 44px system-ui';c.textAlign='center';c.lineWidth=8;c.strokeStyle='#000';c.strokeText(bn.s,0,0);const gr=c.createLinearGradient(0,-34,0,10);gr.addColorStop(0,'#fff3b0');gr.addColorStop(1,'#f97316');c.fillStyle=gr;c.fillText(bn.s,0,0);c.restore()}\n if(paused){c.fillStyle='#000a';c.fillRect(0,0,W,H);c.fillStyle='#fff';c.textAlign='center';c.font='900 30px system-ui';c.fillText('☕ CHAI BREAK',W/2,H/2)}}\n/* ---------- menu ---------- */\nconst pv=$('pv'),pc=pv.getContext('2d');\nfunction ui(){\n $('s0').className=slot===0?'on':'';$('s1').className=slot===1?'on':'';\n [...$('ros').children].forEach((b,i)=>b.className=(sel[0]===i?'a ':'')+(sel[1]===i?'b':''));\n $('bst').textContent=ST[stg].n;$('bar').textContent='🏆 Arcade: '+(arc?'ON':'OFF');$('b2p').textContent='👥 2P keys: '+(two?'ON':'OFF');$('bar').className=arc?'on':'';$('b2p').className=two?'on':'';$('bdf').textContent='CPU: '+DN[df];\n $('inf').innerHTML='<b style=\"color:#fcd34d\">'+CH[sel[0]].n+'</b> ⚡'+CH[sel[0]].sup+' &nbsp;|&nbsp; <b style=\"color:#fda4af\">'+CH[sel[1]].n+'</b> ⚡'+CH[sel[1]].sup}\nCH.forEach((ch,i)=>{const b=document.createElement('button'),k=document.createElement('canvas');k.width=64;k.height=80;const x=k.getContext('2d');x.scale(.4,.4);drawF(x,{ch,dir:1,j:0,st:'idle',p:0,wk:0,sh:0,vy:0},80,195,0);b.append(k,ch.n);b.onclick=()=>{if(net)slot=net.host?0:1;sel[slot]=i;if(slot===0&&!net)slot=1;if(net)net.room.presence({ci:i}).catch(()=>{});ui();osc(500,.08,'sine',.05)};$('ros').append(b)});\n/* ---------- input ---------- */\ndocument.querySelectorAll('.bt').forEach(b=>{const k=b.dataset.k;b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);inp[k]=1;b.classList.add('on')};const u=()=>{b.classList.remove('on');if(k==='block')inp.block=0};b.onpointerup=u;b.onpointercancel=u});\nconst jz=$('jz'),joy=$('joy'),knob=$('knob');let jid=null,jo={x:0,y:0};\nfunction jm(e){let dx=e.clientX-jo.x,dy=e.clientY-jo.y;const d=Math.hypot(dx,dy),m=52;if(d>m){dx*=m/d;dy*=m/d}knob.style.transform=`translate(${dx}px,${dy}px)`;inp.mag=Math.min(1,.45+Math.abs(dx)/m);inp.l=dx<-10?1:0;inp.r=dx>10?1:0;if(dy<-32)inp.up=1;inp.dn=dy>30?1:0}\njz.onpointerdown=e=>{jid=e.pointerId;jz.setPointerCapture(jid);const r=g.getBoundingClientRect();jo={x:e.clientX,y:e.clientY};joy.style.left=e.clientX-r.left-58+'px';joy.style.top=e.clientY-r.top-58+'px';joy.style.opacity=.9;jm(e)};\njz.onpointermove=e=>{if(e.pointerId===jid)jm(e)};\njz.onpointerup=jz.onpointercancel=()=>{jid=null;inp.l=inp.r=inp.dn=0;knob.style.transform='';joy.style.opacity=.4;homeJoy()};\nfunction homeJoy(){joy.style.left='calc(34px + env(safe-area-inset-left))';joy.style.top=g.clientHeight-146+'px'}\n$('pz').onclick=()=>{paused=!paused};\nconst km={a:'l',d:'r',w:'up',' ':'up',s:'dn',j:'punch',k:'kick',l:'block',u:'sup',i:'assist'},km1=Object.assign({arrowleft:'l',arrowright:'r',arrowup:'up',arrowdown:'dn'},km),km2={arrowleft:'l',arrowright:'r',arrowup:'up',arrowdown:'dn',m:'punch',',':'kick','.':'block','/':'sup',n:'assist'},hold=['l','r','block','dn'];\nfunction key(e,d){if(scene!=='fight')return;const q=e.key.toLowerCase(),k=(two?km:km1)[q],k2=two?km2[q]:0;if(!k&&!k2)return;e.preventDefault();\n if(k){inp.mag=1;if(hold.includes(k))inp[k]=d;else if(d&&!e.repeat)inp[k]=1}\n if(k2){if(hold.includes(k2))inp2[k2]=d;else if(d&&!e.repeat)inp2[k2]=1}}\naddEventListener('keydown',e=>key(e,1));addEventListener('keyup',e=>key(e,0));\nfunction gpad(){const gp=navigator.getGamepads&&navigator.getGamepads()[0];if(!gp)return;const a=gp.axes[0]||0,v=gp.axes[1]||0,B=i=>gp.buttons[i]&&gp.buttons[i].pressed;\n if(Math.abs(a)>.25||B(14)||B(15)){inp.l=a<-.25||B(14)?1:0;inp.r=a>.25||B(15)?1:0;inp.mag=Math.max(.5,Math.abs(a));gm=1}else if(gm){inp.l=inp.r=0;gm=0}\n inp.dn=v>.5||B(13)?1:inp.dn&&!gm?inp.dn:0;\n [[0,'up'],[2,'punch'],[3,'kick'],[5,'sup'],[4,'assist']].forEach(([i,k])=>{const p=B(i);if(p&&!gpp[i])inp[k]=1;gpp[i]=p});\n if(B(1)){inp.block=1;gb=1}else if(gb){inp.block=0;gb=0}}\n\n/* ---------- online (room code) ---------- */\nconst CODEC='abcdefghjkmnpqrstuvwxyz23456789',ACTS=['up','punch','kick','sup','assist'];\nasync function onJoin(host){const st=$('ost');let L=null;try{L=typeof claude!=='undefined'&&await claude.use('room')}catch(e){}\n if(!L){st.textContent='❌ Firebase online room connect nahi hua. Login aur Firebase rules check karo.';return}\n const code=host?Array.from({length:5},()=>CODEC[R()*CODEC.length|0]).join(''):$('ocode').value.trim().toLowerCase();\n if(!/^[a-z0-9]{3,12}$/.test(code)){st.textContent='Code galat hai';return}\n try{netLeave();arc=two=false;const room=await L.join('dosto-'+code,host);net={room,host,code,un:[],other:null};slot=host?0:1;\n  room.presence({role:host?'host':'guest',ci:sel[slot]});\n  net.un.push(room.onPeers(netPeers),room.on('snap',onSnap),room.on('go',onGo),room.on('act',onAct));\n  st.textContent=host?'Room code: '+code.toUpperCase()+' — dost ko bhejo':'Judne ki koshish: '+code.toUpperCase();ui();netPeers()}\n catch(e){net=null;st.textContent='❌ Room join nahi hua ('+(e.code||e.message)+')'}}\nfunction netLeave(){if(!net)return;net.un.forEach(u=>u());net.room.leave().catch(()=>{});net=null;$('ost').textContent='';$('ogo').style.display='none'}\nfunction netPeers(){if(!net)return;const o=net.room.peers().find(p=>!p.isMe&&p.presence&&p.presence.role===(net.host?'guest':'host'));\n if(o&&CH[o.presence.ci])sel[net.host?1:0]=o.presence.ci;\n if(net.other&&!o&&scene==='fight'){toMenu();$('ost').textContent='Dost chala gaya 😢'}\n net.other=o||null;if(scene==='menu'){$('ost').textContent=(net.host?'Room: '+net.code.toUpperCase()+' · ':'')+(o?'👥 Dost connected ✅'+(net.host?'':' — host ke start ka wait'):net.host?'Dost ka wait…':'Host nahi mila…');$('ogo').style.display=net.host&&o?'':'none'}ui()}\nfunction emitGo(){net.gid=(net.gid||0)+1;const d={h:sel[0],g:sel[1],s:stg,i:net.gid+':'+(Date.now()%1e6)},f=()=>net&&net.room.emit('go',d).catch(()=>{});f();setTimeout(f,400);setTimeout(f,1000)}\nfunction onGoBtn(){if(net&&net.host&&net.other){emitGo();start(1)}}\nfunction rematch(){if(net){onGoBtn()}else start(1)}\nfunction onGo(m){if(!net||net.host||m.isMe)return;const d=m.data||{};if(d.i===net.lastgo||!CH[d.h]||!CH[d.g])return;net.lastgo=d.i;sel=[d.h,d.g];stg=(d.s|0)%3;start(1)}\nfunction onAct(m){if(!net||!net.host||m.isMe)return;const k=m.data&&m.data.k;if(ACTS.includes(k))inp2[k]=1}\nfunction readRemote(){const p=net.room.peers().find(p=>!p.isMe&&p.presence&&p.presence.role==='guest');if(p){const q=p.presence;inp2.l=q.l|0;inp2.r=q.r|0;inp2.dn=q.dn|0;inp2.block=q.b|0;inp2.mag=+q.m||1}}\nfunction meter(){const m=net&&!net.host?E:P,bs=$('bs'),ba=$('ba');bs.style.setProperty('--p',m.sh+'%');ba.style.setProperty('--p',m.as+'%');bs.classList.toggle('rdy',m.sh>=100);ba.classList.toggle('rdy',m.as>=100)}\nfunction sendSnap(){if(!net||!P)return;const q=f=>[+f.x.toFixed(1),f.j|0,f.vy|0,f.hp|0,f.sh|0,f.as|0,f.st,f.atk,+f.p.toFixed(2),f.alt?1:0,f.w,f.combo,+f.dur.toFixed(2)];\n net.room.emit('snap',{a:q(P),b:q(E),r:[rs,rd,tm|0],pj:projs.map(p=>[p.x|0,p.y|0,+p.t.toFixed(2)]),fx:fxq.splice(0),o:scene==='over'?1:0}).catch(()=>{})}\nfunction ap(f,a){f.tx=a[0];f.j=a[1];f.vy=a[2];f.hp=a[3];f.sh=a[4];f.as=a[5];f.st=a[6];f.atk=a[7];f.p=a[8];f.alt=a[9];f.w=a[10];f.combo=a[11];f.dur=a[12]||1}\nfunction onSnap(m){if(!net||net.host||m.isMe||scene==='menu'||!P)return;const d=m.data;if(!d||!d.a||!d.b)return;ap(P,d.a);ap(E,d.b);rs=d.r[0];rd=d.r[1];tm=d.r[2];projs=(d.pj||[]).map(([x,y,t])=>({x,y,t}));(d.fx||[]).forEach(hfx);if(d.o&&scene==='fight')finish()}\nfunction hfx(a){const k=a[0];\n if(k==='h'){const x=a[1],y=a[2],d=a[3];if(a[4]){spark(x,y,'#93c5fd');sfx.block()}else{spark(x,y,'#fbbf24',16);spark(x,y,'#fff',6);shake=d>100?16:6;sfx.hit(d>100);navigator.vibrate&&navigator.vibrate(d>100?40:15)}txt(x,y-20,d,a[4]?'#93c5fd':'#fff')}\n else if(k==='b'){sfx.boom();shake=20;flash=.55;rings.push({x:a[1],r:10,l:.6})}\n else if(k==='d'){spark(a[1],GY-10,'#fde68a',14);dust(a[1],8);shake=9;sfx.drop()}\n else if(k==='n')banner(a[1],a[2]);\n else if(k==='w'){const n=a[1]==='super'?'charge':a[1];sfx[n]&&sfx[n]()}\n else if(k==='k')sfx.ko()}\nfunction gstep(dt){bn.t-=dt;flash-=dt;\n for(const f of[P,E]){const o=f===P?E:P;f.dir=o.x>f.x?1:-1;f.x+=((f.tx==null?f.x:f.tx)-f.x)*Math.min(1,dt*18);\n  if(f.st==='hit')f.p+=dt;else if(f.atk)f.p=Math.min(1.2,f.p+dt/(f.dur||.4));else if(f.st==='ko')f.p=Math.min(1,f.p+dt*2);else if(f.st==='walk')f.wk+=dt*f.ch.sp/14;\n  f.hl+=(f.hp-f.hl)*Math.min(1,dt*3)}\n for(const p of parts){p.x+=p.vx*dt;p.y+=p.vy*dt;p.l-=dt;if(p.d)p.s+=dt*14}parts=parts.filter(p=>p.l>0);\n for(const t of txts){t.y-=40*dt;t.l-=dt}txts=txts.filter(t=>t.l>0);\n for(const r of rings){r.r+=520*dt;r.l-=dt}rings=rings.filter(r=>r.l>0);\n if(shake>.3)shake*=1;\n const d=Math.abs(P.x-E.x),tz=Math.min(1.14,Math.max(1,W*.5/(d+130)));cam.z+=(tz-cam.z)*Math.min(1,dt*4);const hf=W/(2*cam.z);cam.x+=(Math.max(hf,Math.min(W-hf,(P.x+E.x)/2))-cam.x)*Math.min(1,dt*5);\n const o={role:'guest',ci:sel[1],l:inp.l|0,r:inp.r|0,dn:inp.dn|0,b:inp.block|0,m:Math.round((inp.mag||1)*5)/5},k=JSON.stringify(o);if(k!==net.lk){net.lk=k;net.room.presence(o).catch(()=>{})}\n for(const a of ACTS)if(inp[a]){inp[a]=0;net.room.emit('act',{k:a}).catch(()=>{})}\n meter()}\n/* ---------- loop ---------- */\nfunction size(){const w=g.clientWidth,h=g.clientHeight;if(!w||!h)return;W=net?640:Math.max(540,Math.min(820,360*w/h));cv.style.objectFit=net?'contain':'fill';H=360;GY=H*.8;cv.width=W*2*(h/360>1.6?1:1);cv.height=H*2;homeJoy()}\naddEventListener('resize',size);size();ui();\nlet last=0;function loop(ts_){const dt=Math.min(.033,(ts_-last)/1000||0);last=ts_;T+=dt;\n if(scene==='menu'){pc.setTransform(1.7,0,0,1.7,0,0);pc.clearRect(0,0,500,300);\n  const a={ch:CH[sel[0]],dir:1,j:0,st:'idle',p:0,wk:0,sh:0,vy:0},b={ch:CH[sel[1]],dir:-1,j:0,st:'idle',p:0,wk:0,sh:0,vy:0};\n  pc.fillStyle='#f59e0b';pc.font='900 22px system-ui';pc.textAlign='center';pc.fillText('VS',212,100);\n  drawF(pc,a,120,226,T);drawF(pc,b,304,226,T+1)}\n else{c.setTransform(cv.width/W,0,0,cv.height/H,0,0);if(scene==='fight'){gpad();net&&!net.host?gstep(dt):step(dt)}render()}\n requestAnimationFrame(loop)}\nrequestAnimationFrame(loop);\n</script></body></html>\n";
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
