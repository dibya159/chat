/* Dosto ka Chat feature bridge v1.0
   Loads optional feature modules listed in features.json.
   Feature modules run in this page, so only add code you trust.
*/
(() => {
  'use strict';
  const host = document.getElementById('featureHost');
  const state = { user: null, entries: [], features: new Map(), cleanups: new Map(), listeners: new Map() };
  const emit = (name, detail) => (state.listeners.get(name) || []).forEach(fn => {
    try { fn(detail); } catch (e) { console.error('[DostoBridge event]', e); }
  });
  const api = {
    version: '1.0.0',
    getUser: () => state.user ? Object.freeze({ ...state.user }) : null,
    on(name, callback) {
      if (typeof callback !== 'function') return () => {};
      const list = state.listeners.get(name) || [];
      list.push(callback); state.listeners.set(name, list);
      return () => state.listeners.set(name, list.filter(fn => fn !== callback));
    },
    setUser(user) {
      state.user = user ? Object.freeze({ uid: user.uid, username: user.username, isAdmin: !!user.isAdmin }) : null;
      emit(user ? 'login' : 'logout', api.getUser());
      refreshFeatures();
    },
    register(id, cleanup) {
      if (typeof cleanup === 'function') state.cleanups.set(id, cleanup);
    },
    host
  };
  window.DostoBridge = Object.freeze(api);

  async function loadFeature(entry) {
    if (!entry || !/^[a-z0-9_-]{2,40}$/i.test(entry.id || '') || !entry.module) return;
    if (state.features.has(entry.id)) return;
    try {
      const url = new URL(entry.module, document.baseURI);
      if (url.origin !== location.origin) throw new Error('Feature module must be hosted on this same website.');
      const mod = await import(url.href);
      if (typeof mod.default !== 'function') throw new Error('Feature module must export a default function.');
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
      if (typeof cleanup === 'function') state.cleanups.set(entry.id, cleanup);
      state.features.set(entry.id, section);
      section.hidden = !state.user && entry.requiresLogin !== false;
    } catch (error) {
      console.error('[DostoBridge] Could not load feature:', entry.id, error);
      const warning = document.createElement('p');
      warning.className = 'bridge-error';
      warning.textContent = 'Feature load nahi hua: ' + (entry.title || entry.id);
      host.appendChild(warning);
    }
  }

  function refreshFeatures() {
    state.features.forEach((section, id) => {
      const entry = state.entries.find(item => item.id === id);
      section.hidden = !!(entry && entry.requiresLogin !== false && !state.user);
    });
  }

  async function start() {
    if (!host) return;
    try {
      const response = await fetch(new URL('./features.json', document.baseURI), { cache: 'no-store' });
      if (!response.ok) throw new Error('features.json HTTP ' + response.status);
      const config = await response.json();
      state.entries = Array.isArray(config.features) ? config.features : [];
      for (const entry of state.entries) await loadFeature(entry);
      refreshFeatures();
    } catch (error) {
      console.info('[DostoBridge] No feature list loaded yet:', error.message);
    }
  }
  start();
})();
