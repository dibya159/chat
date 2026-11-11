/* Dosto ka Chat feature bridge v1.1
   Diagnostic loader: shows the actual module-loading error on screen.
   Feature modules run in this page, so only add code you trust.
*/
(() => {
  'use strict';

  const host = document.getElementById('featureHost');
  const state = {
    user: null,
    entries: [],
    features: new Map(),
    cleanups: new Map(),
    listeners: new Map()
  };

  const emit = (name, detail) => (state.listeners.get(name) || []).forEach(fn => {
    try { fn(detail); }
    catch (e) { console.error('[DostoBridge event]', e); }
  });

  const api = {
    version: '1.1.0',
    getUser: () => state.user ? Object.freeze({ ...state.user }) : null,

    on(name, callback) {
      if (typeof callback !== 'function') return () => {};
      const list = state.listeners.get(name) || [];
      list.push(callback);
      state.listeners.set(name, list);
      return () => state.listeners.set(name, list.filter(fn => fn !== callback));
    },

    setUser(user) {
      state.user = user
        ? Object.freeze({
            uid: user.uid,
            username: user.username,
            isAdmin: !!user.isAdmin
          })
        : null;

      emit(user ? 'login' : 'logout', api.getUser());
      refreshFeatures();
    },

    register(id, cleanup) {
      if (typeof cleanup === 'function') state.cleanups.set(id, cleanup);
    },

    host
  };

  window.DostoBridge = Object.freeze(api);

  function showDiagnostic(entry, error) {
    if (!host) return;

    const warning = document.createElement('div');
    warning.className = 'bridge-error';
    warning.style.cssText = [
      'margin:12px 0',
      'padding:12px',
      'border:1px solid #a94c69',
      'border-radius:12px',
      'background:#321827',
      'color:#ffd9e4',
      'font:13px/1.5 system-ui,sans-serif',
      'overflow-wrap:anywhere'
    ].join(';');

    const title = document.createElement('strong');
    title.textContent = 'Feature load failed: ' + (entry.title || entry.id);

    const message = document.createElement('div');
    message.style.marginTop = '6px';
    message.textContent =
      (error && error.name ? error.name + ': ' : '') +
      (error && error.message ? error.message : String(error || 'Unknown error'));

    const path = document.createElement('div');
    path.style.marginTop = '6px';
    path.style.color = '#d9b8c5';
    path.textContent = 'Module: ' + entry.module;

    warning.append(title, message, path);
    host.appendChild(warning);
  }

  async function loadFeature(entry) {
    if (!entry || !/^[a-z0-9_-]{2,40}$/i.test(entry.id || '') || !entry.module) {
      console.warn('[DostoBridge] Invalid feature entry:', entry);
      return;
    }

    if (state.features.has(entry.id)) return;

    try {
      if (!host) throw new Error('HTML element #featureHost nahi mila.');

      const url = new URL(entry.module, document.baseURI);

      if (url.origin !== location.origin) {
        throw new Error('Feature module same website par hosted hona chahiye.');
      }

      const mod = await import(url.href);

      if (typeof mod.default !== 'function') {
        throw new Error('Feature module mein default function export nahi hai.');
      }

      const section = document.createElement('section');
      section.className = 'bridge-feature';
      section.dataset.feature = entry.id;

      if (entry.title) {
        const heading = document.createElement('h3');
        heading.className = 'bridge-title';
        heading.textContent = entry.title;
        section.appendChild(heading);
      }

      host.appendChild(section);

      const cleanup = await mod.default({
        root: section,
        bridge: api,
        getUser: api.getUser,
        on: api.on
      });

      if (typeof cleanup === 'function') {
        state.cleanups.set(entry.id, cleanup);
      }

      state.features.set(entry.id, section);
      section.hidden = !state.user && entry.requiresLogin !== false;

    } catch (error) {
      console.error('[DostoBridge] Could not load feature:', entry.id, error);
      showDiagnostic(entry, error);
    }
  }

  function refreshFeatures() {
    state.features.forEach((section, id) => {
      const entry = state.entries.find(item => item.id === id);
      section.hidden = !!(
        entry &&
        entry.requiresLogin !== false &&
        !state.user
      );
    });
  }

  async function start() {
    if (!host) {
      console.error('[DostoBridge] #featureHost element not found.');
      return;
    }

    try {
      const configUrl = new URL('./features.json', document.baseURI);
      const response = await fetch(configUrl, { cache: 'no-store' });

      if (!response.ok) {
        throw new Error('features.json HTTP ' + response.status);
      }

      const config = await response.json();

      if (!config || !Array.isArray(config.features)) {
        throw new Error('features.json mein "features" array nahi mila.');
      }

      state.entries = config.features;

      for (const entry of state.entries) {
        await loadFeature(entry);
      }

      refreshFeatures();

    } catch (error) {
      console.error('[DostoBridge] Feature list load failed:', error);
      showDiagnostic(
        { id: 'features-list', title: 'Feature list / features.json', module: './features.json' },
        error
      );
    }
  }

  start();
})();
