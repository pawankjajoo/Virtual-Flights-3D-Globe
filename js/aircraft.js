// aircraft.js - Renders pilots as 3D aircraft markers on the globe
// Uses InstancedMesh for performance (1000+ planes @ 60fps)

import * as THREE from 'three';
import { state, events } from './state.js';
import { groups, latLonToVec3, EARTH_RADIUS } from './globe.js';
import { acCategory, getInterpPos } from './data.js';

// Aircraft category colors (match VFM legend)
const CATEGORY_COLORS = {
  heavy:    new THREE.Color(0x38bdf8),
  medium:   new THREE.Color(0xa78bfa),
  lightjet: new THREE.Color(0xf472b6),
  regional: new THREE.Color(0x94a3b8),
  ga:       new THREE.Color(0xfb923c),
  military: new THREE.Color(0xe2e8f0),
  heli:     new THREE.Color(0x64748b),
};
const EMERGENCY_SQUAWKS = new Set(['7500', '7600', '7700']);

// --- Aircraft geometry: simple plane shape (triangle) ---
function makePlaneGeometry(size = 0.008) {
  // A small delta-wing triangle pointing "north" (positive Z)
  const geo = new THREE.BufferGeometry();
  const verts = new Float32Array([
    // Nose
     0,             0,  size * 1.0,
    // Left wingtip
    -size * 0.8,    0, -size * 0.5,
    // Right wingtip
     size * 0.8,    0, -size * 0.5,
    // Tail notch (create two back-facing tris for more body)
     0,             0, -size * 0.2,
  ]);
  const indices = new Uint16Array([0, 1, 3, 0, 3, 2]);
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();
  return geo;
}

// Speed vector geometry (thin line showing 4min projection)
function makeVectorGeometry() {
  const geo = new THREE.BufferGeometry();
  const verts = new Float32Array(6);        // 2 points (from, to)
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  return geo;
}

// --- Module state ---
let planeMesh = null;           // InstancedMesh - all aircraft in one draw call
let planeGeo = null;
let planeMat = null;
let maxInstances = 2000;
let instanceCallsigns = [];     // callsign at each instance index
let vectorGroup = null;         // THREE.Group with speed vector lines

// Build the instanced mesh once, update per-instance transforms each frame
function buildInstancedMesh() {
  planeGeo = makePlaneGeometry(0.012);
  planeMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  // Enable per-instance colors
  planeMesh = new THREE.InstancedMesh(planeGeo, planeMat, maxInstances);
  planeMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxInstances * 3), 3);
  planeMesh.frustumCulled = false;
  planeMesh.count = 0;           // start empty, grow as data arrives
  planeMesh.userData = { type: 'pilots' };
  groups.pilots.add(planeMesh);

  vectorGroup = new THREE.Group();
  vectorGroup.name = 'speedVectors';
  groups.pilots.add(vectorGroup);
}

// Compute rotation matrix that:
//  1) Places the plane tangent to the sphere at (lat, lon)
//  2) Rotates to match heading (degrees from north, clockwise)
function computePlaneMatrix(lat, lon, hdg, scale = 1, altBoost = 0) {
  const r = EARTH_RADIUS + 0.01 + altBoost;
  const pos = latLonToVec3(lat, lon, r);

  // Build orientation: up = surface normal, forward = heading on tangent plane
  const up = pos.clone().normalize();
  // Local east and north vectors at this point
  const north = new THREE.Vector3(0, 1, 0).projectOnPlane(up).normalize();
  const east = new THREE.Vector3().crossVectors(up, north).normalize();

  // Heading rotates from north toward east (clockwise from above)
  const hdgRad = hdg * Math.PI / 180;
  const forward = north.clone().multiplyScalar(Math.cos(hdgRad))
                       .add(east.clone().multiplyScalar(Math.sin(hdgRad)));
  const right = new THREE.Vector3().crossVectors(up, forward).normalize();

  const m = new THREE.Matrix4();
  m.makeBasis(right, up, forward);
  m.setPosition(pos);
  m.scale(new THREE.Vector3(scale, scale, scale));
  return m;
}

// Altitude-based tint (higher = lighter/cyan)
function altitudeTint(alt) {
  // 0-40k ft -> dim to bright cyan-ish overlay
  const t = Math.max(0, Math.min(1, alt / 40000));
  return t;
}

// --- Public API ---
export function initAircraft() {
  buildInstancedMesh();

  // On each data update, rebuild instance transforms
  events.on('data:updated', refreshMarkers);

  // On each frame, update interpolated positions
  events.on('frame', onFrame);

  // On selection event, visual highlight
  events.on('select:pilot', (cs) => {
    state.selected = { type: 'pilot', callsign: cs };
    refreshMarkers();
  });
  events.on('select:none', () => {
    state.selected = null;
    refreshMarkers();
  });

  console.log('aircraft renderer initialized');
}

// Full rebuild - called on data update or selection change
function refreshMarkers() {
  if (!planeMesh) return;

  // Filter pilots by aircraft type if user picked a filter
  const filter = state.globe.acFilter;
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();

  let n = 0;
  instanceCallsigns = [];

  for (const [cs, p] of state.pilots) {
    const cat = acCategory(p.fpl?.type);
    if (filter !== 'all' && cat !== filter) continue;
    if (p.lat === 0 && p.lon === 0) continue;   // skip invalid positions
    if (n >= maxInstances) break;

    const emergency = EMERGENCY_SQUAWKS.has(p.sq);
    const selected = state.selected?.type === 'pilot' && state.selected.callsign === cs;

    // Scale: larger for selected, normal for others
    const scale = selected ? 1.6 : 1.0;
    matrix.copy(computePlaneMatrix(p.lat, p.lon, p.hdg, scale));
    planeMesh.setMatrixAt(n, matrix);

    // Color: emergency = red, selected = yellow, else category color
    if (emergency) {
      color.setHex(0xef4444);
    } else if (selected) {
      color.setHex(0xfacc15);
    } else {
      color.copy(CATEGORY_COLORS[cat] || CATEGORY_COLORS.medium);
      // Fade unselected if selection is active
      if (state.selected) {
        color.multiplyScalar(0.45);
      }
    }
    planeMesh.setColorAt(n, color);

    instanceCallsigns.push(cs);
    n++;
  }

  planeMesh.count = n;
  planeMesh.instanceMatrix.needsUpdate = true;
  if (planeMesh.instanceColor) planeMesh.instanceColor.needsUpdate = true;

  updateSpeedVectors();

  // Update stats counters
  const pilotsEl = document.getElementById('statPilots');
  if (pilotsEl) pilotsEl.textContent = state.pilots.size;
  const tabCountP = document.getElementById('tabCountP');
  if (tabCountP) tabCountP.textContent = state.pilots.size;

  const atcEl = document.getElementById('statAtc');
  if (atcEl) atcEl.textContent = state.controllers.size;
  const tabCountA = document.getElementById('tabCountA');
  if (tabCountA) tabCountA.textContent = state.controllers.size;
}

// Build speed vector lines (4min projection ahead based on gs + hdg)
function updateSpeedVectors() {
  if (!vectorGroup) return;

  // Clear existing
  while (vectorGroup.children.length > 0) {
    const m = vectorGroup.children[0];
    vectorGroup.remove(m);
    m.geometry.dispose();
    m.material.dispose();
  }

  if (!state.layers.speedVectors) return;

  const filter = state.globe.acFilter;
  for (const [cs, p] of state.pilots) {
    const cat = acCategory(p.fpl?.type);
    if (filter !== 'all' && cat !== filter) continue;
    if (p.gs < 30) continue;            // skip stationary
    if (p.lat === 0 && p.lon === 0) continue;

    // 4min projection - distance in nm
    const distNm = p.gs * (4 / 60);
    const distDeg = distNm / 60;
    const hdgRad = p.hdg * Math.PI / 180;
    const dLat = distDeg * Math.cos(hdgRad);
    const dLon = distDeg * Math.sin(hdgRad) / Math.max(0.1, Math.cos(p.lat * Math.PI / 180));
    const endLat = p.lat + dLat;
    const endLon = p.lon + dLon;

    const a = latLonToVec3(p.lat, p.lon, EARTH_RADIUS + 0.012);
    const b = latLonToVec3(endLat, endLon, EARTH_RADIUS + 0.012);
    const g = new THREE.BufferGeometry().setFromPoints([a, b]);
    const mat = new THREE.LineBasicMaterial({
      color: (CATEGORY_COLORS[cat] || CATEGORY_COLORS.medium).getHex(),
      transparent: true,
      opacity: 0.55,
    });
    const line = new THREE.Line(g, mat);
    vectorGroup.add(line);
  }
}

// Per-frame update - applies smooth interpolation to instance positions
let _frameCount = 0;
function onFrame(now) {
  if (!planeMesh || !state.perf.smoothInterp) return;
  _frameCount++;
  // Only reposition every 2 frames to save CPU
  if (_frameCount % 2 !== 0) return;

  const matrix = new THREE.Matrix4();
  for (let i = 0; i < planeMesh.count; i++) {
    const cs = instanceCallsigns[i];
    if (!cs) continue;
    const p = state.pilots.get(cs);
    if (!p) continue;
    const pos = getInterpPos(cs, Date.now()) || { lat: p.lat, lon: p.lon };
    const selected = state.selected?.type === 'pilot' && state.selected.callsign === cs;
    const scale = selected ? 1.6 : 1.0;
    matrix.copy(computePlaneMatrix(pos.lat, pos.lon, p.hdg, scale));
    planeMesh.setMatrixAt(i, matrix);
  }
  planeMesh.instanceMatrix.needsUpdate = true;
}

// Raycast helper - given a mesh + instance id, return the pilot callsign
export function resolveInstanceCallsign(instanceId) {
  return instanceCallsigns[instanceId] || null;
}
