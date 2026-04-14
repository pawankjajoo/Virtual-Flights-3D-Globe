// atc.js - ATC facility zones rendered as 3D circles on the globe
// Facility types: FSS, DEL, GND, TWR, APP, CTR with zoom-dependent visibility

import * as THREE from 'three';
import { state, events } from './state.js';
import { groups, latLonToVec3, EARTH_RADIUS } from './globe.js';

// Facility definitions - matches VATSIM facility codes and VFM aesthetic
const FACILITY = {
  1: { name: 'FSS',      color: 0xc084fc, opacity: 0.35, radius: 0.35,  minZoom: 0 },
  2: { name: 'Delivery', color: 0xfb923c, opacity: 0.45, radius: 0.015, minZoom: 4 },
  3: { name: 'Ground',   color: 0x34d399, opacity: 0.45, radius: 0.020, minZoom: 4 },
  4: { name: 'Tower',    color: 0xfacc15, opacity: 0.55, radius: 0.030, minZoom: 3 },
  5: { name: 'Approach', color: 0x22d3ee, opacity: 0.35, radius: 0.080, minZoom: 2 },
  6: { name: 'Center',   color: 0x818cf8, opacity: 0.25, radius: 0.180, minZoom: 0 },
};

// A cached small airport lookup (populated on demand from public CSV)
const airportCache = new Map();      // icao -> {lat, lon}

// Build a flat ring geometry on the globe surface at given lat/lon/radius
// The "radius" here is in unit-sphere units (approx fraction of earth radius)
function buildRingGeometry(lat, lon, radius, segments = 48) {
  const center = latLonToVec3(lat, lon, EARTH_RADIUS * 1.001);
  const up = center.clone().normalize();

  // Build local tangent basis at this point
  const north = new THREE.Vector3(0, 1, 0).sub(up.clone().multiplyScalar(up.y)).normalize();
  if (north.lengthSq() < 0.01) {
    // at the poles, fall back to X axis
    north.set(1, 0, 0).projectOnPlane(up).normalize();
  }
  const east = new THREE.Vector3().crossVectors(up, north).normalize();

  const verts = [];
  const indices = [];

  // Center vertex (at index 0)
  verts.push(center.x, center.y, center.z);

  // Ring vertices
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const offset = east.clone().multiplyScalar(dx * radius)
      .add(north.clone().multiplyScalar(dy * radius));
    // Keep it tangent to sphere
    const pt = center.clone().add(offset).normalize().multiplyScalar(EARTH_RADIUS * 1.001);
    verts.push(pt.x, pt.y, pt.z);
  }

  // Build triangle fan
  for (let i = 1; i <= segments; i++) {
    indices.push(0, i, i + 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// Build just the edge ring (outline only)
function buildRingEdge(lat, lon, radius, segments = 48) {
  const center = latLonToVec3(lat, lon, EARTH_RADIUS * 1.002);
  const up = center.clone().normalize();
  const north = new THREE.Vector3(0, 1, 0).sub(up.clone().multiplyScalar(up.y)).normalize();
  if (north.lengthSq() < 0.01) {
    north.set(1, 0, 0).projectOnPlane(up).normalize();
  }
  const east = new THREE.Vector3().crossVectors(up, north).normalize();

  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const offset = east.clone().multiplyScalar(dx * radius)
      .add(north.clone().multiplyScalar(dy * radius));
    const pt = center.clone().add(offset).normalize().multiplyScalar(EARTH_RADIUS * 1.002);
    pts.push(pt);
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

// Infer ATC coordinates from callsign prefix or stored airport coords
function resolveAtcCoords(c) {
  if (c.lat != null && c.lon != null) return { lat: c.lat, lon: c.lon };

  // Try to guess airport ICAO from callsign (e.g. "KJFK_TWR" -> KJFK)
  const parts = c.callsign.split('_');
  const possibleIcao = parts[0];
  if (possibleIcao && airportCache.has(possibleIcao)) {
    return airportCache.get(possibleIcao);
  }
  return null;
}

// Airport coordinates - load a subset of major airports for ATC positioning
// Uses OurAirports public data (large_airport type only, ~600 fields)
async function loadAirports() {
  try {
    // Use a small curated list first for fastest startup
    const resp = await fetch('https://raw.githubusercontent.com/mwgg/Airports/master/airports.json');
    if (!resp.ok) throw new Error('airports fetch failed');
    const data = await resp.json();
    for (const [icao, info] of Object.entries(data)) {
      if (info.lat && info.lon) {
        airportCache.set(icao, { lat: info.lat, lon: info.lon });
      }
    }
    console.log(`loaded ${airportCache.size} airports`);
    events.emit('airports:loaded');
  } catch(err) {
    console.warn('airport load failed:', err);
  }
}

// Build or rebuild all ATC rings
function refreshAtc() {
  // Clean existing
  while (groups.atc.children.length > 0) {
    const m = groups.atc.children[0];
    groups.atc.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material) m.material.dispose();
  }

  if (!state.layers.atc) return;

  for (const [cs, c] of state.controllers) {
    const fac = FACILITY[c.facility];
    if (!fac) continue;         // observers (0) don't render
    const coords = resolveAtcCoords(c);
    if (!coords) continue;

    // Filled disc (transparent)
    const geo = buildRingGeometry(coords.lat, coords.lon, fac.radius);
    const mat = new THREE.MeshBasicMaterial({
      color: fac.color,
      transparent: true,
      opacity: fac.opacity * 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const disc = new THREE.Mesh(geo, mat);
    disc.userData = { type: 'atc', callsign: cs };
    groups.atc.add(disc);

    // Outline ring
    const edgeGeo = buildRingEdge(coords.lat, coords.lon, fac.radius);
    const edgeMat = new THREE.LineBasicMaterial({
      color: fac.color,
      transparent: true,
      opacity: 0.9,
    });
    const edge = new THREE.Line(edgeGeo, edgeMat);
    edge.userData = { type: 'atc', callsign: cs };
    groups.atc.add(edge);
  }
}

export function initAtc() {
  // Load airport database in background - don't block startup
  loadAirports();

  // Rebuild on data updates
  events.on('data:updated', () => {
    refreshAtc();
  });

  // Also rebuild when airports finish loading (since controllers may now resolve)
  events.on('airports:loaded', refreshAtc);

  // Layer toggle
  events.on('layer:toggle', ({ name, visible }) => {
    if (name === 'atc') refreshAtc();
  });

  console.log('atc renderer initialized');
}
