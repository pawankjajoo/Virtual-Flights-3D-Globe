// state.js - Central app state, shared across modules
// No external deps. Other modules import `state` and mutate it.

export const state = {
  // pilot/atc data from all networks, keyed by callsign
  pilots: new Map(),        // Map<callsign, pilotObject>
  controllers: new Map(),   // Map<callsign, controllerObject>
  prefiles: new Map(),      // Map<callsign, prefileObject> (no live position)

  // network data raw cache for debugging
  raw: { vatsim: null, ivao: null, poscon: null },

  // network toggles
  netEnabled: { VATSIM: true, IVAO: true, POSCON: true },

  // selection
  selected: null,           // { type: 'pilot'|'atc', callsign }

  // ui state
  ui: {
    searchOpen: false,
    panelOpen: false,
    panelTab: 'pilots',
    settingsOpen: false,
    drawerOpen: false,
    drawerTab: 'info',
  },

  // layer toggles (what to render on globe)
  layers: {
    atc: true,
    routes: true,
    weather: false,
    navaids: false,
    airways: false,
    fir: false,
    speedVectors: true,
    trails: false,
    atmosphere: true,
    stars: true,
    clouds: false,
    grid: false,
    terminator: true,
  },

  // globe settings
  globe: {
    texture: 'topo',        // 'topo' | 'bluemarble' | 'night' | 'dark'
    timeMode: 'auto',       // 'auto' | 'day' | 'night' | 'dusk'
    autoRotate: false,
    acFilter: 'all',
  },

  // performance
  perf: {
    smoothInterp: true,
    fps: 0,
    lastFetch: 0,
    pollInterval: 30000,    // ms
  },

  // polling engine
  polling: {
    active: false,
    tabHidden: false,
    idleSince: Date.now(),
  },

  // AIRAC cycle (calculated at startup)
  airac: { cycle: '', effective: '', expires: '' },
};

export function initState() {
  // Compute AIRAC cycle (28-day cycles starting 2026-01-22)
  const epoch = new Date('2026-01-22T00:00:00Z');
  const now = new Date();
  const daysSince = Math.floor((now - epoch) / (1000 * 60 * 60 * 24));
  const cyclesSince = Math.floor(daysSince / 28);
  const effective = new Date(epoch.getTime() + cyclesSince * 28 * 24 * 60 * 60 * 1000);
  const expires = new Date(effective.getTime() + 28 * 24 * 60 * 60 * 1000);
  const year = effective.getFullYear() % 100;
  const cycleNum = cyclesSince + 1;
  state.airac.cycle = `${year.toString().padStart(2, '0')}${cycleNum.toString().padStart(2, '0')}`;
  state.airac.effective = effective.toISOString().slice(0, 10);
  state.airac.expires = expires.toISOString().slice(0, 10);

  // Load persisted preferences
  try {
    const saved = localStorage.getItem('pss_vfg_prefs');
    if (saved) {
      const p = JSON.parse(saved);
      if (p.theme) document.documentElement.dataset.theme = p.theme;
      if (p.globe) Object.assign(state.globe, p.globe);
      if (p.layers) Object.assign(state.layers, p.layers);
      if (p.netEnabled) Object.assign(state.netEnabled, p.netEnabled);
    }
  } catch(e) {
    console.warn('failed to load preferences:', e);
  }

  // Tab visibility for adaptive polling
  document.addEventListener('visibilitychange', () => {
    state.polling.tabHidden = document.hidden;
  });

  // Track activity for idle detection
  ['mousemove', 'keydown', 'touchstart'].forEach(evt => {
    window.addEventListener(evt, () => {
      state.polling.idleSince = Date.now();
    }, { passive: true });
  });
}

export function savePrefs() {
  try {
    const p = {
      theme: document.documentElement.dataset.theme || 'night',
      globe: state.globe,
      layers: state.layers,
      netEnabled: state.netEnabled,
    };
    localStorage.setItem('pss_vfg_prefs', JSON.stringify(p));
  } catch(e) {
    console.warn('failed to save prefs:', e);
  }
}

// Event bus - simple pub/sub for cross-module comms
const listeners = new Map();
export const events = {
  on(evt, fn) {
    if (!listeners.has(evt)) listeners.set(evt, new Set());
    listeners.get(evt).add(fn);
  },
  off(evt, fn) {
    if (listeners.has(evt)) listeners.get(evt).delete(fn);
  },
  emit(evt, data) {
    if (listeners.has(evt)) {
      listeners.get(evt).forEach(fn => {
        try { fn(data); } catch(e) { console.error(`event ${evt} handler:`, e); }
      });
    }
  },
};
