/* Dosto ka Chat - Premium Animation Engine v1.0
   Bridge feature module. Lightweight CSS-first animations.
   Respects prefers-reduced-motion and avoids changing chat logic.
*/
export default function ({ root, bridge, getUser, on }) {
  if (!root) return;

  const STYLE_ID = "dosto-premium-animation-style";
  let style = document.getElementById(STYLE_ID);

  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      :root {
        --dosto-motion-fast: 160ms;
        --dosto-motion-normal: 260ms;
        --dosto-motion-slow: 420ms;
        --dosto-ease: cubic-bezier(.2,.75,.25,1);
      }

      /* Gentle page and panel entrance */
      #app, #featureHost, #msgs, #bar, .bridge-feature {
        animation: dostoFadeUp 420ms var(--dosto-ease) both;
      }
      .bridge-feature:empty { display: none; }

      /* Chat messages: animate only newly-added message rows */
      #msgs > .dosto-msg-enter,
      #msgs > * > .dosto-msg-enter {
        animation: dostoMessageIn 260ms var(--dosto-ease) both;
        transform-origin: 50% 100%;
      }

      /* Tactile controls */
      #app button, #app [role="button"], #app a,
      #featureHost button, #featureHost [role="button"] {
        transition:
          transform var(--dosto-motion-fast) var(--dosto-ease),
          filter var(--dosto-motion-fast) ease,
          opacity var(--dosto-motion-fast) ease,
          box-shadow var(--dosto-motion-fast) ease;
        -webkit-tap-highlight-color: transparent;
      }
      #app button:active, #app [role="button"]:active,
      #featureHost button:active, #featureHost [role="button"]:active {
        transform: scale(.965);
      }

      /* Focus is visible and polished for keyboard/accessibility */
      #app button:focus-visible, #app input:focus-visible,
      #app textarea:focus-visible, #featureHost button:focus-visible {
        outline: 2px solid rgba(115, 170, 255, .85);
        outline-offset: 3px;
      }

      /* Inputs get a subtle focus transition */
      #app input, #app textarea, #app select {
        transition: border-color 180ms ease, box-shadow 180ms ease, background 180ms ease;
      }
      #app input:focus, #app textarea:focus, #app select:focus {
        box-shadow: 0 0 0 3px rgba(100, 150, 255, .12);
      }

      /* Feature panels and dialogs */
      .dosto-animate-in {
        animation: dostoFadeUp 300ms var(--dosto-ease) both;
      }
      .dosto-animate-pop {
        animation: dostoPop 240ms var(--dosto-ease) both;
      }

      @keyframes dostoFadeUp {
        from { opacity: 0; transform: translate3d(0, 9px, 0); }
        to   { opacity: 1; transform: translate3d(0, 0, 0); }
      }
      @keyframes dostoMessageIn {
        from { opacity: 0; transform: translate3d(0, 10px, 0) scale(.985); }
        to   { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
      }
      @keyframes dostoPop {
        from { opacity: 0; transform: scale(.96); }
        to   { opacity: 1; transform: scale(1); }
      }

      @media (hover: hover) and (pointer: fine) {
        #app button:hover, #app [role="button"]:hover,
        #featureHost button:hover, #featureHost [role="button"]:hover {
          filter: brightness(1.08);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          scroll-behavior: auto !important;
          animation-duration: .01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: .01ms !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  const animated = new WeakSet();
  const messageSelectors = [
    "#msgs > *",
    "#msgs [data-message-id]",
    "#msgs .message",
    "#msgs .msg",
    "#msgs .chat-message"
  ];

  function markMessage(node) {
    if (!(node instanceof Element) || animated.has(node)) return;
    if (node.matches("script, style, link, br")) return;
    animated.add(node);
    node.classList.add("dosto-msg-enter");
  }

  function scanMessages(scope = document) {
    for (const selector of messageSelectors) {
      try {
        scope.querySelectorAll(selector).forEach(markMessage);
      } catch (_) {}
    }
  }

  // Existing messages are left in place; only newly inserted rows animate.
  scanMessages();

  const observer = new MutationObserver(records => {
    for (const record of records) {
      record.addedNodes.forEach(node => {
        if (!(node instanceof Element)) return;
        if (node.closest("#msgs")) {
          if (node.parentElement && node.parentElement.id === "msgs") markMessage(node);
          scanMessages(node);
        }
      });
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Animate common app panels when they become visible.
  const visibilityObserver = new MutationObserver(records => {
    for (const record of records) {
      if (record.type !== "attributes" || record.attributeName !== "class") continue;
      const el = record.target;
      if (!(el instanceof Element)) continue;
      const isPanel = el.matches("#app, #msgs, #featureHost, .bridge-feature, [role='dialog']");
      if (isPanel && !el.hidden) {
        el.classList.remove("dosto-animate-in");
        void el.offsetWidth;
        el.classList.add("dosto-animate-in");
      }
    }
  });
  visibilityObserver.observe(document.body, {
    attributes: true, attributeFilter: ["class"], subtree: true
  });

  // Mark the feature host as initialized without adding visible UI.
  root.dataset.animationEngine = "ready";

  return () => {
    observer.disconnect();
    visibilityObserver.disconnect();
    root.removeAttribute("data-animation-engine");
    // Keep the shared stylesheet while the app is running; it is harmless
    // and avoids flicker if the feature is re-mounted.
  };
}
