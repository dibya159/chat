/* Dosto ka Chat | Premium Motion Engine v2
   CSS-first progressive enhancement. No Firebase/chat data changes.
   Install via the existing DostoBridge feature loader.
*/
export default function ({ root, bridge, getUser, on }) {
  if (!root || document.getElementById("dosto-motion-engine")) return;

  const style = document.createElement("style");
  style.id = "dosto-motion-engine";
  style.textContent = `
    :root {
      --dm-ease: cubic-bezier(.2,.75,.25,1);
      --dm-spring: cubic-bezier(.18,1.25,.35,1);
      --dm-fast: 150ms;
      --dm-mid: 280ms;
      --dm-slow: 460ms;
    }

    /* Ambient premium backdrop: subtle, low-cost CSS only */
    body.dosto-motion-ready::before {
      content:"";
      position:fixed; inset:-25%;
      z-index:-1; pointer-events:none;
      background:
        radial-gradient(ellipse at 12% 18%, rgba(77,116,255,.10), transparent 34%),
        radial-gradient(ellipse at 88% 78%, rgba(133,75,255,.08), transparent 36%),
        radial-gradient(ellipse at 55% 5%, rgba(43,204,190,.045), transparent 32%);
      animation: dmAmbient 18s ease-in-out infinite alternate;
      will-change: transform, opacity;
    }
    @keyframes dmAmbient {
      0% { transform:translate3d(-1%,0,0) scale(1); opacity:.65; }
      100% { transform:translate3d(1.5%,1%,0) scale(1.045); opacity:1; }
    }

    /* Floating ambient specks. Pointer-events none so chat stays usable. */
    .dm-particles {
      position:fixed; inset:0; overflow:hidden; pointer-events:none;
      z-index:0; contain:strict; opacity:.34;
    }
    .dm-particles i {
      position:absolute; bottom:-12px; width:3px; height:3px; border-radius:50%;
      background:rgba(160,190,255,.7);
      box-shadow:0 0 9px rgba(120,160,255,.55);
      animation:dmFloat var(--dm-duration,18s) linear infinite;
      animation-delay:var(--dm-delay,0s);
    }
    @keyframes dmFloat {
      0% { transform:translate3d(0,0,0) scale(.65); opacity:0; }
      12% { opacity:.65; }
      85% { opacity:.4; }
      100% { transform:translate3d(var(--dm-drift,24px),-105vh,0) scale(1.25); opacity:0; }
    }

    /* Screen, card and tab transitions */
    .dm-enter { animation:dmEnter var(--dm-mid) var(--dm-ease) both; }
    .dm-pop { animation:dmPop 360ms var(--dm-spring) both; }
    .dm-tab-enter { animation:dmTab 260ms var(--dm-ease) both; }
    @keyframes dmEnter {
      from { opacity:0; transform:translate3d(0,12px,0); }
      to { opacity:1; transform:translate3d(0,0,0); }
    }
    @keyframes dmPop {
      from { opacity:0; transform:scale(.94); }
      to { opacity:1; transform:scale(1); }
    }
    @keyframes dmTab {
      from { opacity:.55; transform:translate3d(0,5px,0); }
      to { opacity:1; transform:translate3d(0,0,0); }
    }

    /* Message arrival */
    .dm-message-in { animation:dmMessage 290ms var(--dm-spring) both; }
    @keyframes dmMessage {
      0% { opacity:0; transform:translate3d(0,12px,0) scale(.975); }
      70% { opacity:1; transform:translate3d(0,-1px,0) scale(1.005); }
      100% { opacity:1; transform:translate3d(0,0,0) scale(1); }
    }

    /* Buttons: subtle tactile press and hover */
    #app button, #app [role="button"], #featureHost button,
    #featureHost [role="button"], #app a, #featureHost a {
      -webkit-tap-highlight-color:transparent;
      transition:transform var(--dm-fast) var(--dm-ease),
        filter var(--dm-fast) ease, box-shadow var(--dm-fast) ease,
        opacity var(--dm-fast) ease;
    }
    #app button:active, #app [role="button"]:active,
    #featureHost button:active, #featureHost [role="button"]:active {
      transform:scale(.965);
    }
    @media (hover:hover) and (pointer:fine) {
      #app button:hover, #featureHost button:hover,
      #app [role="button"]:hover, #featureHost [role="button"]:hover {
        filter:brightness(1.08);
      }
    }

    /* Profile avatar ring */
    .dm-avatar-ring {
      position:relative; isolation:isolate;
    }
    .dm-avatar-ring::after {
      content:""; position:absolute; inset:-3px; border-radius:inherit;
      border:1.5px solid transparent;
      background:linear-gradient(135deg,rgba(115,160,255,.9),rgba(175,105,255,.75),rgba(75,220,205,.75)) border-box;
      -webkit-mask:linear-gradient(#000 0 0) padding-box,linear-gradient(#000 0 0);
      -webkit-mask-composite:xor; mask-composite:exclude;
      opacity:.75; animation:dmRing 5s linear infinite;
      pointer-events:none;
    }
    @keyframes dmRing { to { filter:hue-rotate(360deg); transform:rotate(360deg); } }

    /* Typing dots: apply to recognized typing indicators */
    .dm-typing-dots { display:inline-flex; align-items:center; gap:3px; vertical-align:middle; }
    .dm-typing-dots i {
      width:4px; height:4px; border-radius:50%; background:currentColor; opacity:.45;
      animation:dmDot 1.05s ease-in-out infinite;
    }
    .dm-typing-dots i:nth-child(2) { animation-delay:140ms; }
    .dm-typing-dots i:nth-child(3) { animation-delay:280ms; }
    @keyframes dmDot {
      0%,60%,100% { transform:translateY(0); opacity:.35; }
      30% { transform:translateY(-4px); opacity:1; }
    }

    /* Story rings / story cards */
    .dm-story-ring { position:relative; }
    .dm-story-ring::after {
      content:""; position:absolute; inset:-3px; border-radius:inherit;
      border:2px solid rgba(135,155,255,.85);
      animation:dmStoryPulse 2.2s ease-out infinite;
      pointer-events:none;
    }
    @keyframes dmStoryPulse {
      0% { transform:scale(.96); opacity:.8; }
      100% { transform:scale(1.12); opacity:0; }
    }
    .dm-story-open { animation:dmStoryOpen 330ms var(--dm-ease) both; }
    @keyframes dmStoryOpen {
      from { opacity:0; transform:scale(.97) translateY(8px); }
      to { opacity:1; transform:scale(1) translateY(0); }
    }

    /* Leaderboard highlight / trophy shimmer */
    .dm-rank-highlight { animation:dmRank 2.8s ease-in-out infinite; }
    @keyframes dmRank {
      0%,100% { box-shadow:0 0 0 rgba(255,205,95,0); }
      50% { box-shadow:0 0 18px rgba(255,205,95,.18); }
    }
    .dm-trophy { display:inline-block; transform-origin:50% 85%; animation:dmTrophy 2.4s ease-in-out infinite; }
    @keyframes dmTrophy {
      0%,100% { transform:rotate(0) translateY(0); }
      15% { transform:rotate(-8deg) translateY(-2px); }
      30% { transform:rotate(8deg) translateY(-2px); }
      45% { transform:rotate(0) translateY(0); }
    }

    /* Voice-note waveform visual motion */
    .dm-wave { display:inline-flex; align-items:center; gap:2px; height:22px; }
    .dm-wave i {
      display:block; width:3px; height:var(--dm-h,8px); border-radius:4px;
      background:currentColor; opacity:.78;
      animation:dmWave 850ms ease-in-out infinite alternate;
      animation-delay:var(--dm-delay,0ms);
      transform-origin:center;
    }
    @keyframes dmWave {
      from { transform:scaleY(.45); opacity:.48; }
      to { transform:scaleY(1); opacity:1; }
    }

    /* Toast / notification entrance */
    .dm-toast-in { animation:dmToast 320ms var(--dm-spring) both; }
    @keyframes dmToast {
      from { opacity:0; transform:translate3d(0,-10px,0) scale(.97); }
      to { opacity:1; transform:translate3d(0,0,0) scale(1); }
    }

    /* Focus polish */
    #app input, #app textarea, #app select {
      transition:border-color 180ms ease, box-shadow 180ms ease, background 180ms ease;
    }
    #app input:focus, #app textarea:focus, #app select:focus {
      box-shadow:0 0 0 3px rgba(105,150,255,.13);
    }
    #app button:focus-visible, #app input:focus-visible,
    #app textarea:focus-visible, #featureHost button:focus-visible {
      outline:2px solid rgba(125,170,255,.9); outline-offset:3px;
    }

    @media (prefers-reduced-motion:reduce) {
      *,*::before,*::after {
        animation-duration:.01ms !important; animation-iteration-count:1 !important;
        transition-duration:.01ms !important; scroll-behavior:auto !important;
      }
      .dm-particles { display:none !important; }
    }
  `;
  document.head.appendChild(style);
  document.body.classList.add("dosto-motion-ready");

  // Decorative particles, intentionally few and low opacity.
  const particles = document.createElement("div");
  particles.className = "dm-particles";
  particles.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 12; i++) {
    const dot = document.createElement("i");
    dot.style.left = `${(i * 37 + 11) % 100}%`;
    dot.style.setProperty("--dm-duration", `${16 + (i % 6) * 2}s`);
    dot.style.setProperty("--dm-delay", `${-(i % 8) * 1.7}s`);
    dot.style.setProperty("--dm-drift", `${(i % 2 ? 1 : -1) * (12 + (i % 4) * 9)}px`);
    particles.appendChild(dot);
  }
  document.body.appendChild(particles);

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const cleanupFns = [];
  const seenMessages = new WeakSet();

  function addClassOnce(el, cls) {
    if (!(el instanceof Element) || el.classList.contains(cls)) return;
    el.classList.add(cls);
  }

  function enhance(rootNode = document) {
    // Newly added chat rows only. Existing history does not replay animations.
    const rows = rootNode.querySelectorAll?.(
      "#msgs > *, #msgs [data-message-id], #msgs .message, #msgs .msg, #msgs .chat-message"
    ) || [];
    rows.forEach(el => {
      if (seenMessages.has(el)) return;
      seenMessages.add(el);
      el.classList.add("dm-message-in");
    });

    // Best-effort enhancements for semantic/data-marked UI elements.
    rootNode.querySelectorAll?.(
      "[data-dm-avatar], .profile-avatar, .user-avatar, .member-avatar"
    ).forEach(el => el.classList.add("dm-avatar-ring"));

    rootNode.querySelectorAll?.(
      "[data-dm-story], .story-item, .story-card"
    ).forEach(el => el.classList.add("dm-story-ring"));

    rootNode.querySelectorAll?.(
      "[data-dm-rank], .leaderboard-top, .rank-card"
    ).forEach(el => el.classList.add("dm-rank-highlight"));

    rootNode.querySelectorAll?.(
      "[data-dm-trophy], .trophy, .rank-trophy"
    ).forEach(el => el.classList.add("dm-trophy"));

    rootNode.querySelectorAll?.(
      "[data-dm-toast], .toast, .notification, .toast-message"
    ).forEach(el => el.classList.add("dm-toast-in"));

    rootNode.querySelectorAll?.(
      "[data-dm-story-viewer], .story-viewer, .story-modal"
    ).forEach(el => el.classList.add("dm-story-open"));

    rootNode.querySelectorAll?.(
      "[data-dm-waveform], .voice-waveform, .audio-waveform"
    ).forEach(el => {
      if (el.dataset.dmWaveReady) return;
      el.dataset.dmWaveReady = "1";
      el.classList.add("dm-wave");
      if (!el.children.length) {
        for (let i = 0; i < 16; i++) {
          const bar = document.createElement("i");
          bar.style.setProperty("--dm-h", `${5 + ((i * 7) % 15)}px`);
          bar.style.setProperty("--dm-delay", `${(i % 7) * 75}ms`);
          el.appendChild(bar);
        }
      }
    });
  }

  enhance();

  const observer = new MutationObserver(records => {
    for (const record of records) {
      record.addedNodes.forEach(node => {
        if (node instanceof Element) {
          enhance(node);
          if (node.matches("#msgs > *") || node.parentElement?.id === "msgs") {
            if (!seenMessages.has(node)) {
              seenMessages.add(node);
              node.classList.add("dm-message-in");
            }
          }
        }
      });
    }
  });
  observer.observe(document.body, { childList:true, subtree:true });

  // Animate known app views when their visibility changes, without taking over routing.
  const visibility = new MutationObserver(records => {
    for (const record of records) {
      const el = record.target;
      if (!(el instanceof Element) || el.hidden) continue;
      if (el.matches("[data-screen], .app-screen, .tab-panel, [role='tabpanel']")) {
        el.classList.remove("dm-tab-enter");
        void el.offsetWidth;
        el.classList.add("dm-tab-enter");
      }
    }
  });
  visibility.observe(document.body, {
    attributes:true, attributeFilter:["hidden", "class", "style"], subtree:true
  });

  root.dataset.motionEngine = "v2";

  return () => {
    observer.disconnect();
    visibility.disconnect();
    particles.remove();
    style.remove();
    document.body.classList.remove("dosto-motion-ready");
    root.removeAttribute("data-motion-engine");
    cleanupFns.forEach(fn => { try { fn(); } catch (_) {} });
  };
}
