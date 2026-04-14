// data.js - Data pipeline for VATSIM, IVAO, POSCON
// Ported from VFM's pfetch engine with circuit breaker, dedup, adaptive polling

import { state, events } from './state.js';

// Endpoints. Batch endpoint is a Cloudflare worker that combines all 3 networks
const BATCH_URL = 'https://pss-vfm-batch.pushstartsims-com.workers.dev/batch';
const CORS_PROXY = 'https://pss-cors-proxy.pushstartsims-com.workers.dev/';
const VATSIM_URL = 'https://data.vatsim.net/v3/vatsim-data.json';
const IVAO_URL = 'https://api.ivao.aero/v2/tracker/whazzup';
const POSCON_URL = 'https://api.poscon.net/online.json';

// --- Resilient fetch (pfetch) ---
// Circuit breaker state per domain
const _circuitBreaker = new Map();   // domain -> { failures, openUntil }
// Request dedup - identical requests share one promise
const _inflight = new Map();

function _cbKey(url) {
  try { return new URL(url).host; } catch { return url; }
}
function _cbOpen(domain) {
  const entry = _circuitBreaker.get(domain);
  if (!entry) return false;
  if (entry.openUntil > Date.now()) return true;
  // window expired - reset
  _circuitBreaker.delete(domain);
  return false;
}
function _cbTrip(domain) {
  const entry = _circuitBreaker.get(domain) || { failures: 0, openUntil: 0 };
  entry.failures++;
  if (entry.failures >= 3) {
    entry.openUntil = Date.now() + 60000;    // 60s cooldown
    entry.failures = 0;
    console.warn(`circuit breaker open for ${domain}`);
  }
  _circuitBreaker.set(domain, entry);
}
function _cbReset(domain) {
  _circuitBreaker.delete(domain);
}

export async function pfetch(url, opts = {}, maxRetries = 3) {
  const domain = _cbKey(url);
  if (_cbOpen(domain)) {
    throw new Error(`circuit breaker open: ${domain}`);
  }

  // Dedup identical requests
  const key = url + JSON.stringify(opts);
  if (_inflight.has(key)) return _inflight.get(key);

  const promise = (async () => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const ctrl = new AbortController();
        const timeoutId = setTimeout(() => ctrl.abort(), 15000);
        const resp = await fetch(url, { ...opts, signal: ctrl.signal });
        clearTimeout(timeoutId);

        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }
        _cbReset(domain);
        // Return parsed JSON if content-type suggests it
        const ct = resp.headers.get('content-type') || '';
        if (ct.includes('json')) return await resp.json();
        return await resp.text();
      } catch(err) {
        console.warn(`fetch attempt ${attempt+1}/${maxRetries+1} failed for ${domain}:`, err.message);
        if (attempt === maxRetries) {
          _cbTrip(domain);
          throw err;
        }
        // exponential backoff
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
  })();

  _inflight.set(key, promise);
  promise.finally(() => _inflight.delete(key));
  return promise;
}

// --- Aircraft category classification ---
// Map ICAO aircraft type code to one of our display categories
export function acCategory(type) {
  if (!type) return 'medium';
  const t = type.toUpperCase();
  // Helicopters
  if (/^(H|AS|EC|B47|BH|R22|R44|R66|B06|B222|B407|AW|NH|S76|S92|UH)/.test(t)) return 'heli';
  // Military
  if (/^(F|A10|B52|B1|B2|C5|C17|C130|C135|E3|E4|E6|KC|P3|P8|V22|RQ|MQ|AV8|EA|FA|T38)/.test(t)) return 'military';
  // Heavy
  if (/^(A30|A31|A33|A34|A35|A38|B74|B77|B78|B78|MD11|IL|AN|C5)/.test(t)) return 'heavy';
  if (/^(A3[01234578]|B7[4578])/.test(t)) return 'heavy';
  // Light jet / private
  if (/^(C25|C56|C68|CL|G|GLF|LJ|CL60|BE4|E55|E50|PC12|PC24|HA|H25)/.test(t)) return 'lightjet';
  // Regional
  if (/^(AT|CRJ|DH|E14|E17|E19|E7[0-9]|SF|ATR|DHC|EMB)/.test(t)) return 'regional';
  // General aviation (props/piston)
  if (/^(C1[5-8]|C2|PA|BE|M20|DA|DR|SR|TB|DV|AA|TBM|C82|C90|SF34|CE|PI)/.test(t)) return 'ga';
  // Medium default (A320/737/etc.)
  if (/^(A3[12]|B7[37])/.test(t)) return 'medium';
  return 'medium';
}

// --- Normalizers ---
// Convert raw network data into unified pilot object
function normalizeVatsimPilot(p) {
  return {
    callsign: p.callsign,
    cid: p.cid,
    name: p.name || '',
    network: 'VATSIM',
    lat: p.latitude,
    lon: p.longitude,
    alt: p.altitude || 0,
    gs: p.groundspeed || 0,
    hdg: p.heading || 0,
    sq: p.transponder || '',
    fpl: p.flight_plan ? {
      type: p.flight_plan.aircraft_short || p.flight_plan.aircraft || '',
      dep: p.flight_plan.departure || '',
      arr: p.flight_plan.arrival || '',
      alt: p.flight_plan.altitude || '',
      tas: p.flight_plan.cruise_tas || '',
      rules: p.flight_plan.flight_rules || '',
      route: p.flight_plan.route || '',
      remarks: p.flight_plan.remarks || '',
      alternate: p.flight_plan.alternate || '',
      deptime: p.flight_plan.deptime || '',
      enroute: `${p.flight_plan.enroute_time || '0000'}`,
      endurance: `${p.flight_plan.fuel_time || '0000'}`,
    } : null,
    logon: p.logon_time,
    lastUpdated: p.last_updated,
  };
}

function normalizeIvaoPilot(p) {
  const fp = p.flightPlan || {};
  const lr = p.lastTrack || {};
  return {
    callsign: p.callsign,
    cid: p.userId,
    name: '',
    network: 'IVAO',
    lat: lr.latitude || 0,
    lon: lr.longitude || 0,
    alt: lr.altitude || 0,
    gs: lr.groundSpeed || 0,
    hdg: lr.heading || 0,
    sq: lr.transponder || '',
    fpl: fp ? {
      type: fp.aircraftId || '',
      dep: fp.departureId || '',
      arr: fp.arrivalId || '',
      alt: fp.level || '',
      tas: fp.speed || '',
      rules: fp.flightRules || '',
      route: fp.route || '',
      remarks: fp.remarks || '',
      alternate: fp.alternateId || '',
    } : null,
  };
}

function normalizePosconPilot(p) {
  return {
    callsign: p.callsign,
    cid: p.cid || p.vid,
    name: p.name || '',
    network: 'POSCON',
    lat: p.position?.lat || p.latitude || 0,
    lon: p.position?.lon || p.longitude || 0,
    alt: p.altitude || 0,
    gs: p.groundspeed || p.ground_speed || 0,
    hdg: p.heading || p.hdg || 0,
    sq: p.transponder || '',
    fpl: p.flightplan ? {
      type: p.flightplan.aircraft || '',
      dep: p.flightplan.departure || '',
      arr: p.flightplan.arrival || '',
      alt: p.flightplan.altitude || '',
      route: p.flightplan.route || '',
    } : null,
  };
}

function normalizeVatsimController(c) {
  return {
    callsign: c.callsign,
    cid: c.cid,
    name: c.name || '',
    network: 'VATSIM',
    freq: c.frequency || '',
    facility: c.facility,    // 0=OBS, 1=FSS, 2=DEL, 3=GND, 4=TWR, 5=APP, 6=CTR
    rating: c.rating,
    atis: (c.text_atis || []).join('\n'),
    logon: c.logon_time,
    // ATC position comes from network.transceivers or we estimate from callsign
    lat: null, lon: null,
  };
}

function normalizeIvaoController(c) {
  return {
    callsign: c.callsign,
    cid: c.userId,
    name: '',
    network: 'IVAO',
    freq: c.atcSession?.frequency || '',
    facility: c.atcSession?.position || 0,
    rating: c.rating || 0,
    atis: (c.atis?.lines || []).join('\n'),
    lat: c.atcSession?.latitude || null,
    lon: c.atcSession?.longitude || null,
  };
}

function normalizePosconController(c) {
  return {
    callsign: c.callsign,
    cid: c.cid || c.vid,
    name: c.name || '',
    network: 'POSCON',
    freq: c.frequency || '',
    facility: c.facility || 0,
    rating: c.rating || 0,
    atis: c.atis || '',
    lat: c.centerPoint?.lat || null,
    lon: c.centerPoint?.lon || null,
  };
}

// --- Fetch and merge all networks ---
async function fetchAllNetworks() {
  let merged = { pilots: [], controllers: [], prefiles: [] };

  // Try batch endpoint first (fast)
  try {
    const batch = await pfetch(BATCH_URL);
    if (batch?.vatsim) {
      state.raw.vatsim = batch.vatsim;
      if (state.netEnabled.VATSIM) {
        merged.pilots.push(...(batch.vatsim.pilots || []).map(normalizeVatsimPilot));
        merged.controllers.push(...(batch.vatsim.controllers || []).map(normalizeVatsimController));
        merged.prefiles.push(...(batch.vatsim.prefiles || []).map(normalizeVatsimPilot));
      }
    }
    if (batch?.ivao) {
      state.raw.ivao = batch.ivao;
      if (state.netEnabled.IVAO) {
        merged.pilots.push(...(batch.ivao.clients?.pilots || []).map(normalizeIvaoPilot));
        merged.controllers.push(...(batch.ivao.clients?.atcs || []).map(normalizeIvaoController));
      }
    }
    if (batch?.poscon) {
      state.raw.poscon = batch.poscon;
      if (state.netEnabled.POSCON) {
        merged.pilots.push(...(batch.poscon.pilots || []).map(normalizePosconPilot));
        merged.controllers.push(...(batch.poscon.atc || []).map(normalizePosconController));
      }
    }
    return merged;
  } catch(err) {
    console.warn('batch fetch failed, falling back:', err.message);
  }

  // Fallback - hit each network directly
  const fetches = [];
  if (state.netEnabled.VATSIM) {
    fetches.push(pfetch(VATSIM_URL).then(d => {
      state.raw.vatsim = d;
      merged.pilots.push(...(d.pilots || []).map(normalizeVatsimPilot));
      merged.controllers.push(...(d.controllers || []).map(normalizeVatsimController));
      merged.prefiles.push(...(d.prefiles || []).map(normalizeVatsimPilot));
    }).catch(e => console.warn('vatsim:', e.message)));
  }
  if (state.netEnabled.IVAO) {
    fetches.push(pfetch(CORS_PROXY + encodeURIComponent(IVAO_URL)).then(d => {
      state.raw.ivao = d;
      merged.pilots.push(...(d.clients?.pilots || []).map(normalizeIvaoPilot));
      merged.controllers.push(...(d.clients?.atcs || []).map(normalizeIvaoController));
    }).catch(e => console.warn('ivao:', e.message)));
  }
  if (state.netEnabled.POSCON) {
    fetches.push(pfetch(CORS_PROXY + encodeURIComponent(POSCON_URL)).then(d => {
      state.raw.poscon = d;
      merged.pilots.push(...(d.pilots || []).map(normalizePosconPilot));
      merged.controllers.push(...(d.atc || []).map(normalizePosconController));
    }).catch(e => console.warn('poscon:', e.message)));
  }
  await Promise.allSettled(fetches);
  return merged;
}

// --- Position interpolation engine (30fps smooth motion between polls) ---
const interpState = {
  prev: new Map(),    // callsign -> { lat, lon, ts }
  curr: new Map(),    // callsign -> { lat, lon, hdg, gs, ts }
};
function updateInterp(pilots) {
  const now = Date.now();
  // Shift curr -> prev
  for (const [cs, c] of interpState.curr) {
    interpState.prev.set(cs, { lat: c.lat, lon: c.lon, ts: c.ts });
  }
  interpState.curr.clear();
  for (const p of pilots) {
    interpState.curr.set(p.callsign, {
      lat: p.lat, lon: p.lon, hdg: p.hdg, gs: p.gs, ts: now
    });
  }
}

// Get interpolated position for a callsign at current moment
export function getInterpPos(cs, now = Date.now()) {
  const c = interpState.curr.get(cs);
  if (!c) return null;
  // Dead reckoning from hdg and gs
  const dt = (now - c.ts) / 1000;           // seconds since last update
  if (dt < 0.1 || !state.perf.smoothInterp) return { lat: c.lat, lon: c.lon };
  const distNm = c.gs * (dt / 3600);        // nautical miles moved
  const distDeg = distNm / 60;              // approx degrees (latitude - longitude at equator)
  const hdgRad = c.hdg * Math.PI / 180;
  const dLat = distDeg * Math.cos(hdgRad);
  const dLon = distDeg * Math.sin(hdgRad) / Math.cos(c.lat * Math.PI / 180);
  return { lat: c.lat + dLat, lon: c.lon + dLon };
}

// --- Main polling loop ---
let pollTimer = null;
async function pollOnce() {
  try {
    const t0 = performance.now();
    const data = await fetchAllNetworks();
    const elapsed = Math.round(performance.now() - t0);

    // Update state
    state.pilots.clear();
    state.controllers.clear();
    state.prefiles.clear();
    for (const p of data.pilots) state.pilots.set(p.callsign, p);
    for (const c of data.controllers) state.controllers.set(c.callsign, c);
    for (const p of data.prefiles) state.prefiles.set(p.callsign, p);

    updateInterp(data.pilots);

    state.perf.lastFetch = Date.now();

    // Emit update event for renderers
    events.emit('data:updated', { elapsed });

    // Status footer
    const footEl = document.getElementById('footStatus');
    if (footEl) footEl.textContent = `updated ${new Date().toLocaleTimeString()}`;
    const footUp = document.getElementById('footUpdate');
    if (footUp) footUp.textContent = `${elapsed}ms`;
    const netEl = document.getElementById('statNet');
    if (netEl) {
      netEl.innerHTML = `<span class="stat-dot stat-ok"></span>live`;
    }
  } catch(err) {
    console.error('poll failed:', err);
    const netEl = document.getElementById('statNet');
    if (netEl) {
      netEl.innerHTML = `<span class="stat-dot stat-err"></span>offline`;
    }
  }
}

function computeInterval() {
  // Adaptive polling based on activity
  if (state.polling.tabHidden) return 0;           // don't poll when hidden
  const idleMs = Date.now() - state.polling.idleSince;
  if (idleMs > 180000) return 60000;               // 60s if idle > 3min
  return 30000;                                    // 30s default
}

function schedule() {
  if (pollTimer) clearTimeout(pollTimer);
  const ms = computeInterval();
  if (ms === 0) {
    // hidden tab - check again in 5s to catch visibility change
    pollTimer = setTimeout(schedule, 5000);
    return;
  }
  pollTimer = setTimeout(async () => {
    await pollOnce();
    schedule();
  }, ms);
}

export function startPolling() {
  state.polling.active = true;
  pollOnce();       // immediate first call
  schedule();
}

export function stopPolling() {
  state.polling.active = false;
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
}

export function initData() {
  // Listen for network toggle changes - immediate re-fetch
  events.on('net:toggle', (netName) => {
    pollOnce();
  });
  console.log('data pipeline initialized');
}
