// ui.js - All UI event handlers: search, panel, drawer, settings, layer toggles
// Keeps DOM manipulation centralized; other modules emit events on state changes.

import { state, events, savePrefs } from './state.js';
import { focusOn } from './globe.js';

let uiInitialized = false;

export function initUI() {
  if (uiInitialized) return;
  uiInitialized = true;

  setupHeader();
  setupSearch();
  setupLayers();
  setupPanel();
  setupDrawer();
  setupSettings();
  setupKeyboard();

  // Initial AIRAC display
  const airacEl = document.getElementById('airacInfo');
  if (airacEl) {
    airacEl.innerHTML = `Cycle ${state.airac.cycle}<br>Effective ${state.airac.effective}<br>Expires ${state.airac.expires}`;
  }

  // Respond to data updates: refresh panel list
  events.on('data:updated', () => refreshPanelList());

  // Respond to selection events
  events.on('select:pilot', (cs) => openPilotDrawer(cs));
  events.on('select:atc', (cs) => openAtcDrawer(cs));
  events.on('select:none', () => closeDrawer());

  console.log('ui initialized');
}

// --- Header buttons ---
function setupHeader() {
  document.getElementById('btnSearch').addEventListener('click', () => {
    toggleSearch(true);
  });
  document.getElementById('btnPanel').addEventListener('click', () => {
    togglePanel();
  });
  document.getElementById('btnSettings').addEventListener('click', () => {
    toggleSettings();
  });
}

// --- Search ---
function setupSearch() {
  const wrap = document.getElementById('searchWrap');
  const inp = document.getElementById('searchInp');
  const close = document.getElementById('searchClose');
  const results = document.getElementById('searchResults');

  inp.addEventListener('input', () => {
    const q = inp.value.trim().toUpperCase();
    if (!q) {
      results.classList.remove('show');
      results.innerHTML = '';
      return;
    }
    const hits = searchAll(q);
    if (hits.length === 0) {
      results.innerHTML = '<div class="sr-item" style="color:var(--text-mute)">no matches</div>';
      results.classList.add('show');
      return;
    }
    results.innerHTML = hits.slice(0, 10).map(h =>
      `<div class="sr-item" data-cs="${h.callsign}" data-kind="${h.kind}">
        <div>
          <div class="sr-cs">${h.callsign}</div>
          <div class="sr-meta">${h.meta}</div>
        </div>
        <div class="sr-meta">${h.tag}</div>
      </div>`
    ).join('');
    results.classList.add('show');

    results.querySelectorAll('.sr-item').forEach(el => {
      el.addEventListener('click', () => {
        const cs = el.dataset.cs;
        const kind = el.dataset.kind;
        if (kind === 'pilot') {
          const p = state.pilots.get(cs);
          if (p) {
            events.emit('select:pilot', cs);
            focusOn(p.lat, p.lon, 1.8);
          }
        } else if (kind === 'atc') {
          const c = state.controllers.get(cs);
          if (c && c.lat != null) {
            events.emit('select:atc', cs);
            focusOn(c.lat, c.lon, 2.0);
          } else if (c) {
            events.emit('select:atc', cs);
          }
        }
        toggleSearch(false);
      });
    });
  });

  close.addEventListener('click', () => toggleSearch(false));

  // Click outside search box - close
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap) toggleSearch(false);
  });
}

function searchAll(q) {
  const out = [];
  for (const [cs, p] of state.pilots) {
    if (cs.includes(q) ||
        (p.fpl?.dep && p.fpl.dep.includes(q)) ||
        (p.fpl?.arr && p.fpl.arr.includes(q))) {
      out.push({
        callsign: cs,
        kind: 'pilot',
        meta: p.fpl ? `${p.fpl.dep || '?'} -> ${p.fpl.arr || '?'} · ${p.fpl.type || '?'}` : p.network,
        tag: p.network,
      });
    }
  }
  for (const [cs, c] of state.controllers) {
    if (cs.includes(q) || (c.freq && c.freq.includes(q))) {
      out.push({
        callsign: cs,
        kind: 'atc',
        meta: `${c.freq || '?'} · ${c.network}`,
        tag: 'ATC',
      });
    }
  }
  return out;
}

function toggleSearch(show) {
  const wrap = document.getElementById('searchWrap');
  const inp = document.getElementById('searchInp');
  if (show) {
    wrap.classList.add('show');
    setTimeout(() => inp.focus(), 50);
  } else {
    wrap.classList.remove('show');
    inp.value = '';
    document.getElementById('searchResults').classList.remove('show');
  }
  state.ui.searchOpen = show;
}

// --- Layer toggles on left stack ---
function setupLayers() {
  document.querySelectorAll('.layer-btn').forEach(btn => {
    const name = btn.dataset.layer;
    // Initial state
    if (state.layers[name]) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
    btn.addEventListener('click', () => {
      const newVal = !state.layers[name];
      state.layers[name] = newVal;
      btn.classList.toggle('active', newVal);
      events.emit('layer:toggle', { name, visible: newVal });
      savePrefs();
    });
  });
}

// --- Side panel ---
function setupPanel() {
  const panel = document.getElementById('panel');
  const close = document.getElementById('panelClose');
  const tabs = panel.querySelectorAll('.panel-tab');
  const filter = document.getElementById('panelFilter');

  close.addEventListener('click', () => togglePanel(false));

  tabs.forEach(t => {
    t.addEventListener('click', () => {
      tabs.forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      state.ui.panelTab = t.dataset.tab;
      refreshPanelList();
    });
  });

  filter.addEventListener('input', refreshPanelList);
}

function togglePanel(show) {
  const panel = document.getElementById('panel');
  if (show === undefined) show = !state.ui.panelOpen;
  panel.classList.toggle('show', show);
  state.ui.panelOpen = show;
  // Hide settings if opening panel
  if (show) {
    document.getElementById('settings').classList.remove('show');
    state.ui.settingsOpen = false;
  }
  if (show) refreshPanelList();
}

function refreshPanelList() {
  const body = document.getElementById('panelBody');
  if (!body) return;
  const tab = state.ui.panelTab;
  const q = (document.getElementById('panelFilter')?.value || '').toUpperCase();

  let items = [];
  if (tab === 'pilots') {
    for (const [cs, p] of state.pilots) {
      if (q && !cs.includes(q) && !(p.fpl?.dep || '').includes(q) && !(p.fpl?.arr || '').includes(q)) continue;
      items.push({ cs, p, kind: 'pilot' });
    }
    items.sort((a, b) => a.cs.localeCompare(b.cs));
    body.innerHTML = items.map(it => {
      const { cs, p } = it;
      const route = p.fpl ? `${p.fpl.dep || '?'} -> ${p.fpl.arr || '?'}` : '';
      const type = p.fpl?.type || '';
      const selected = state.selected?.type === 'pilot' && state.selected.callsign === cs;
      return `<div class="pl-item ${selected ? 'selected' : ''}" data-cs="${cs}" data-kind="pilot">
        <div class="pl-row1">
          <span class="pl-cs">${cs}</span>
          <span class="pl-net">${p.network}</span>
        </div>
        <div class="pl-row2">
          <span class="pl-route">${route}</span>
          <span>${type}</span>
          <span>${Math.round(p.alt).toLocaleString()}ft</span>
          <span>${Math.round(p.gs)}kt</span>
        </div>
      </div>`;
    }).join('') || '<div style="padding:20px;color:var(--text-mute);text-align:center">no pilots online</div>';
  } else {
    for (const [cs, c] of state.controllers) {
      if (q && !cs.includes(q) && !(c.freq || '').includes(q)) continue;
      items.push({ cs, c, kind: 'atc' });
    }
    items.sort((a, b) => a.cs.localeCompare(b.cs));
    body.innerHTML = items.map(it => {
      const { cs, c } = it;
      const selected = state.selected?.type === 'atc' && state.selected.callsign === cs;
      return `<div class="pl-item ${selected ? 'selected' : ''}" data-cs="${cs}" data-kind="atc">
        <div class="pl-row1">
          <span class="pl-cs">${cs}</span>
          <span class="pl-net">${c.network}</span>
        </div>
        <div class="pl-row2">
          <span>${c.freq || '-'}</span>
          <span>${c.name || ''}</span>
        </div>
      </div>`;
    }).join('') || '<div style="padding:20px;color:var(--text-mute);text-align:center">no controllers online</div>';
  }

  // Click handlers
  body.querySelectorAll('.pl-item').forEach(el => {
    el.addEventListener('click', () => {
      const cs = el.dataset.cs;
      const kind = el.dataset.kind;
      if (kind === 'pilot') {
        const p = state.pilots.get(cs);
        if (p) {
          events.emit('select:pilot', cs);
          focusOn(p.lat, p.lon, 1.8);
        }
      } else {
        const c = state.controllers.get(cs);
        if (c) {
          events.emit('select:atc', cs);
          if (c.lat != null) focusOn(c.lat, c.lon, 2.2);
        }
      }
    });
  });
}

// --- Info drawer ---
function setupDrawer() {
  const close = document.getElementById('drClose');
  close.addEventListener('click', closeDrawer);
}

function closeDrawer() {
  document.getElementById('drawer').classList.remove('show');
  state.ui.drawerOpen = false;
  state.selected = null;
  events.emit('data:updated');     // re-render aircraft without selection highlight
}

function openPilotDrawer(cs) {
  const p = state.pilots.get(cs);
  if (!p) return;
  const dr = document.getElementById('drawer');
  document.getElementById('drCs').textContent = cs;
  document.getElementById('drBadge').textContent = p.network;
  document.getElementById('drType').textContent = p.fpl?.type || '';

  // Build tabs
  const tabsEl = document.getElementById('drTabs');
  tabsEl.innerHTML = `
    <button class="drawer-tab active" data-tab="info">Info</button>
    <button class="drawer-tab" data-tab="route">Route</button>
    <button class="drawer-tab" data-tab="live">Live</button>
  `;
  tabsEl.querySelectorAll('.drawer-tab').forEach(t => {
    t.addEventListener('click', () => {
      tabsEl.querySelectorAll('.drawer-tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      renderPilotTab(p, t.dataset.tab);
    });
  });
  renderPilotTab(p, 'info');

  dr.classList.add('show');
  state.ui.drawerOpen = true;
}

function renderPilotTab(p, tab) {
  const body = document.getElementById('drBody');
  if (tab === 'info') {
    body.innerHTML = `
      <div class="drawer-grid">
        <div class="drawer-cell"><span class="drawer-cell-lbl">Departure</span><span class="drawer-cell-val">${p.fpl?.dep || '-'}</span></div>
        <div class="drawer-cell"><span class="drawer-cell-lbl">Arrival</span><span class="drawer-cell-val">${p.fpl?.arr || '-'}</span></div>
        <div class="drawer-cell"><span class="drawer-cell-lbl">Alternate</span><span class="drawer-cell-val">${p.fpl?.alternate || '-'}</span></div>
        <div class="drawer-cell"><span class="drawer-cell-lbl">Aircraft</span><span class="drawer-cell-val">${p.fpl?.type || '-'}</span></div>
        <div class="drawer-cell"><span class="drawer-cell-lbl">Rules</span><span class="drawer-cell-val">${p.fpl?.rules || '-'}</span></div>
        <div class="drawer-cell"><span class="drawer-cell-lbl">Filed TAS</span><span class="drawer-cell-val">${p.fpl?.tas || '-'}kt</span></div>
        <div class="drawer-cell"><span class="drawer-cell-lbl">Filed ALT</span><span class="drawer-cell-val">${p.fpl?.alt || '-'}</span></div>
        <div class="drawer-cell"><span class="drawer-cell-lbl">Transponder</span><span class="drawer-cell-val">${p.sq || '-'}</span></div>
      </div>
      ${p.fpl?.remarks ? `<div style="margin-top:12px;padding:10px;background:var(--surface-2);border-radius:6px;font-size:11px;font-family:'SF Mono',monospace;color:var(--text-dim);">${p.fpl.remarks}</div>` : ''}
    `;
  } else if (tab === 'route') {
    body.innerHTML = `
      <div style="margin-bottom:10px;">
        <span class="drawer-cell-val" style="font-size:14px;">${p.fpl?.dep || '?'}</span>
        <span style="color:var(--text-mute); margin:0 8px;">-></span>
        <span class="drawer-cell-val" style="font-size:14px;">${p.fpl?.arr || '?'}</span>
      </div>
      <div style="font-family:'SF Mono',monospace;font-size:11px;color:var(--text-dim);padding:10px;background:var(--surface-2);border-radius:6px;word-break:break-word;line-height:1.6;">
        ${p.fpl?.route || '<no route filed>'}
      </div>
    `;
  } else if (tab === 'live') {
    body.innerHTML = `
      <div class="drawer-grid">
        <div class="drawer-cell"><span class="drawer-cell-lbl">Altitude</span><span class="drawer-cell-val">${Math.round(p.alt).toLocaleString()}ft</span></div>
        <div class="drawer-cell"><span class="drawer-cell-lbl">Groundspeed</span><span class="drawer-cell-val">${Math.round(p.gs)}kt</span></div>
        <div class="drawer-cell"><span class="drawer-cell-lbl">Heading</span><span class="drawer-cell-val">${Math.round(p.hdg)}°</span></div>
        <div class="drawer-cell"><span class="drawer-cell-lbl">Position</span><span class="drawer-cell-val">${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}</span></div>
        <div class="drawer-cell"><span class="drawer-cell-lbl">Squawk</span><span class="drawer-cell-val">${p.sq || '-'}</span></div>
        <div class="drawer-cell"><span class="drawer-cell-lbl">Network</span><span class="drawer-cell-val">${p.network}</span></div>
      </div>
    `;
  }
}

function openAtcDrawer(cs) {
  const c = state.controllers.get(cs);
  if (!c) return;
  const dr = document.getElementById('drawer');
  document.getElementById('drCs').textContent = cs;
  document.getElementById('drBadge').textContent = c.network;
  document.getElementById('drType').textContent = 'ATC';

  const tabsEl = document.getElementById('drTabs');
  tabsEl.innerHTML = `
    <button class="drawer-tab active" data-tab="info">Info</button>
    <button class="drawer-tab" data-tab="atis">ATIS</button>
  `;
  tabsEl.querySelectorAll('.drawer-tab').forEach(t => {
    t.addEventListener('click', () => {
      tabsEl.querySelectorAll('.drawer-tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      renderAtcTab(c, t.dataset.tab);
    });
  });
  renderAtcTab(c, 'info');

  dr.classList.add('show');
  state.ui.drawerOpen = true;
}

function renderAtcTab(c, tab) {
  const body = document.getElementById('drBody');
  const facilities = { 0: 'Observer', 1: 'FSS', 2: 'Delivery', 3: 'Ground', 4: 'Tower', 5: 'Approach', 6: 'Center' };
  if (tab === 'info') {
    body.innerHTML = `
      <div class="drawer-grid">
        <div class="drawer-cell"><span class="drawer-cell-lbl">Frequency</span><span class="drawer-cell-val">${c.freq || '-'}</span></div>
        <div class="drawer-cell"><span class="drawer-cell-lbl">Facility</span><span class="drawer-cell-val">${facilities[c.facility] || '-'}</span></div>
        <div class="drawer-cell"><span class="drawer-cell-lbl">Name</span><span class="drawer-cell-val">${c.name || '-'}</span></div>
        <div class="drawer-cell"><span class="drawer-cell-lbl">Network</span><span class="drawer-cell-val">${c.network}</span></div>
      </div>
    `;
  } else if (tab === 'atis') {
    body.innerHTML = `
      <button class="setting-opt" id="atisSpeak" style="margin-bottom:10px;">🔊 Listen</button>
      <div style="font-family:'SF Mono',monospace;font-size:11px;color:var(--text-dim);padding:10px;background:var(--surface-2);border-radius:6px;white-space:pre-wrap;line-height:1.6;">
        ${c.atis || '<no ATIS available>'}
      </div>
    `;
    const btn = document.getElementById('atisSpeak');
    if (btn && c.atis) {
      btn.addEventListener('click', () => speakAtis(c.atis, c.callsign));
    }
  }
}

// --- ATIS TTS ---
function speakAtis(text, callsign) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  // Expand abbreviations for TTS
  const clean = text
    .replace(/ATIS/g, 'A T I S')
    .replace(/METAR/g, 'metar')
    .replace(/RWY/g, 'runway')
    .replace(/ILS/g, 'I L S')
    .replace(/VOR/g, 'V O R')
    .replace(/NDB/g, 'N D B')
    .replace(/\bKTS\b/g, 'knots')
    .replace(/\bFL(\d+)/g, 'flight level $1');
  const u = new SpeechSynthesisUtterance(clean);
  u.rate = 1.05;
  u.pitch = 0.95;
  u.volume = 0.9;
  window.speechSynthesis.speak(u);
}

// --- Settings panel ---
function setupSettings() {
  document.getElementById('settingsClose').addEventListener('click', () => toggleSettings(false));

  // Globe texture options
  document.querySelectorAll('#optTexture .setting-opt').forEach(b => {
    if (b.dataset.val === state.globe.texture) b.classList.add('active');
    b.addEventListener('click', () => {
      document.querySelectorAll('#optTexture .setting-opt').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      state.globe.texture = b.dataset.val;
      events.emit('globe:texture', b.dataset.val);
      savePrefs();
    });
  });

  // Time mode options
  document.querySelectorAll('#optTime .setting-opt').forEach(b => {
    if (b.dataset.val === state.globe.timeMode) b.classList.add('active');
    b.addEventListener('click', () => {
      document.querySelectorAll('#optTime .setting-opt').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      state.globe.timeMode = b.dataset.val;
      events.emit('globe:timeMode');
      savePrefs();
    });
  });

  // Network toggles
  const netMap = { togVatsim: 'VATSIM', togIvao: 'IVAO', togPoscon: 'POSCON' };
  for (const [id, name] of Object.entries(netMap)) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.checked = state.netEnabled[name];
    el.addEventListener('change', () => {
      state.netEnabled[name] = el.checked;
      events.emit('net:toggle', name);
      savePrefs();
    });
  }

  // Aircraft filter
  const filter = document.getElementById('acFilter');
  filter.value = state.globe.acFilter;
  filter.addEventListener('change', () => {
    state.globe.acFilter = filter.value;
    events.emit('data:updated');
    savePrefs();
  });

  // Layer/show toggles
  const showMap = {
    togAtmosphere: 'atmosphere',
    togStars: 'stars',
    togClouds: 'clouds',
    togGrid: 'grid',
    togTerminator: 'terminator',
    togSpeedVectors: 'speedVectors',
    togTrails: 'trails',
  };
  for (const [id, layer] of Object.entries(showMap)) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.checked = state.layers[layer];
    el.addEventListener('change', () => {
      state.layers[layer] = el.checked;
      events.emit('layer:toggle', { name: layer, visible: el.checked });
      events.emit('data:updated');    // rebuild if speed vectors changed
      savePrefs();
    });
  }

  // Perf toggles
  document.getElementById('togInterp').checked = state.perf.smoothInterp;
  document.getElementById('togInterp').addEventListener('change', (e) => {
    state.perf.smoothInterp = e.target.checked;
  });
  document.getElementById('togAutoRotate').checked = state.globe.autoRotate;
  document.getElementById('togAutoRotate').addEventListener('change', (e) => {
    state.globe.autoRotate = e.target.checked;
    savePrefs();
  });
}

function toggleSettings(show) {
  if (show === undefined) show = !state.ui.settingsOpen;
  document.getElementById('settings').classList.toggle('show', show);
  state.ui.settingsOpen = show;
  // Hide panel if opening settings
  if (show) {
    document.getElementById('panel').classList.remove('show');
    state.ui.panelOpen = false;
  }
}

// --- Keyboard shortcuts ---
function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (state.ui.searchOpen) { toggleSearch(false); e.preventDefault(); return; }
      if (state.ui.drawerOpen) { closeDrawer(); e.preventDefault(); return; }
      if (state.ui.settingsOpen) { toggleSettings(false); e.preventDefault(); return; }
      if (state.ui.panelOpen) { togglePanel(false); e.preventDefault(); return; }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      toggleSearch(true);
    }
  });
}
