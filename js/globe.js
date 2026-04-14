// globe.js - Three.js 3D globe with atmosphere, stars, lighting, and day/night terminator
// Ported from upstream: jeantimex/flight-path (MIT) with customizations for flight tracking

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { state, events } from './state.js';

// Scene objects (module-level so other modules can reach in)
export let scene, camera, renderer, controls, earth, atmosphere, stars, clouds, grid;
export const EARTH_RADIUS = 1;
const ATM_RADIUS = EARTH_RADIUS * 1.018;
const CLOUDS_RADIUS = EARTH_RADIUS * 1.005;

// Groups that other modules attach to
export const groups = {
  pilots: null,      // aircraft markers
  atc: null,         // ATC zone rings
  routes: null,      // flight routes
  navaids: null,     // VOR/NDB/Fix markers
  airways: null,     // airway lines
  weather: null,     // weather overlays
  metar: null,       // METAR station markers
  fir: null,         // FIR/UIR boundaries
  trails: null,      // position trails
};

// Texture URLs for different globe styles
const TEXTURES = {
  topo: {
    diffuse: 'https://unpkg.com/three-globe@2.31.1/example/img/earth-blue-marble.jpg',
    name: 'Blue Marble (day)',
  },
  bluemarble: {
    diffuse: 'https://unpkg.com/three-globe@2.31.1/example/img/earth-blue-marble.jpg',
    name: 'Blue Marble',
  },
  night: {
    diffuse: 'https://unpkg.com/three-globe@2.31.1/example/img/earth-night.jpg',
    name: 'Night Lights',
  },
  dark: {
    // generated solid-color texture at load time
    diffuse: null,
    name: 'Dark Minimal',
  },
};

let textureLoader;

// Convert lat/lon to 3D position on unit sphere
export function latLonToVec3(lat, lon, radius = EARTH_RADIUS) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
}

// Inverse - get lat/lon from a 3D point
export function vec3ToLatLon(v) {
  const r = v.length();
  const lat = 90 - (Math.acos(v.y / r) * 180) / Math.PI;
  let lon = (Math.atan2(v.z, -v.x) * 180) / Math.PI - 180;
  if (lon < -180) lon += 360;
  if (lon > 180) lon -= 360;
  return { lat, lon };
}

// Great-circle interpolation between two lat/lon points
export function greatCircle(lat1, lon1, lat2, lon2, segments = 64) {
  const pts = [];
  const a = latLonToVec3(lat1, lon1);
  const b = latLonToVec3(lat2, lon2);
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    // slerp on unit sphere
    const v = new THREE.Vector3().copy(a).lerp(b, t).normalize().multiplyScalar(EARTH_RADIUS * 1.002);
    pts.push(v);
  }
  return pts;
}

// Compute subsolar point for current UTC time (for day/night terminator)
export function getSunPosition(date = new Date()) {
  const J = date.getTime() / 86400000 + 2440587.5;       // Julian date
  const T = (J - 2451545) / 36525;                       // Julian centuries since J2000
  const L = (280.46646 + T * 36000.76983) % 360;         // mean longitude
  const M = (357.52911 + T * 35999.05029) % 360;         // mean anomaly
  const Mr = M * Math.PI / 180;
  const C = (1.914602 - 0.004817*T) * Math.sin(Mr) +
            (0.019993 - 0.000101*T) * Math.sin(2*Mr) +
            0.000289 * Math.sin(3*Mr);
  const trueLong = (L + C) * Math.PI / 180;
  const obliq = 23.439 * Math.PI / 180;
  const dec = Math.asin(Math.sin(obliq) * Math.sin(trueLong));    // declination
  // Hour angle from UTC time
  const utcHours = date.getUTCHours() + date.getUTCMinutes()/60 + date.getUTCSeconds()/3600;
  const gmst = (18.697374558 + 24.06570982441908 * (J - 2451545)) % 24;
  const subsolarLon = -15 * ((gmst + 12) % 24 - 12);
  const subsolarLat = dec * 180 / Math.PI;
  return { lat: subsolarLat, lon: subsolarLon };
}

// Build a dark minimal texture procedurally (solid color with grid)
function makeDarkTexture() {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 1024;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0a0f1e';
  ctx.fillRect(0, 0, c.width, c.height);
  // subtle grid
  ctx.strokeStyle = '#1a2139';
  ctx.lineWidth = 1;
  for (let x = 0; x < c.width; x += c.width / 24) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, c.height); ctx.stroke();
  }
  for (let y = 0; y < c.height; y += c.height / 12) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(c.width, y); ctx.stroke();
  }
  return new THREE.CanvasTexture(c);
}

// Load texture with a fallback-to-solid-color on error
function loadTex(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(makeDarkTexture());
    textureLoader.load(url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        resolve(tex);
      },
      undefined,
      () => resolve(makeDarkTexture())
    );
  });
}

// Build the star field (procedural point cloud)
function buildStars() {
  const count = 4000;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    // uniform distribution on a sphere at radius 80
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const r = 80 + Math.random() * 20;
    positions[i*3]   = r * Math.sin(phi) * Math.cos(theta);
    positions[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i*3+2] = r * Math.cos(phi);
    // slight blue-white tint variation
    const t = 0.7 + Math.random() * 0.3;
    colors[i*3]   = t * 0.9;
    colors[i*3+1] = t * 0.95;
    colors[i*3+2] = t;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: 0.15,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geo, mat);
}

// Build the atmosphere halo shader (rim lighting effect)
function buildAtmosphere() {
  const geo = new THREE.SphereGeometry(ATM_RADIUS, 64, 48);
  const mat = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vPositionNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPositionNormal = normalize((modelViewMatrix * vec4(position, 1.0)).xyz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      varying vec3 vPositionNormal;
      uniform vec3 glowColor;
      void main() {
        float rim = 1.0 - abs(dot(vNormal, vPositionNormal));
        float intensity = pow(rim, 2.5) * 1.4;
        gl_FragColor = vec4(glowColor, 1.0) * intensity;
      }
    `,
    uniforms: {
      glowColor: { value: new THREE.Color(0x22d3ee) },
    },
    side: THREE.BackSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  return new THREE.Mesh(geo, mat);
}

// Build lat/lon grid (wireframe overlay)
function buildGrid() {
  const geo = new THREE.SphereGeometry(EARTH_RADIUS * 1.001, 36, 18);
  const mat = new THREE.LineBasicMaterial({
    color: 0x22d3ee, transparent: true, opacity: 0.15
  });
  const wireframe = new THREE.WireframeGeometry(geo);
  return new THREE.LineSegments(wireframe, mat);
}

// Swap the earth texture based on current setting
export async function applyTexture(texKey) {
  if (!earth) return;
  const tex = await loadTex(TEXTURES[texKey]?.diffuse);
  earth.material.map = tex;
  earth.material.needsUpdate = true;
}

// Apply lighting based on time mode
export function applyLighting() {
  if (!scene) return;
  const mode = state.globe.timeMode;
  const ambient = scene.getObjectByName('ambientLight');
  const sun = scene.getObjectByName('sunLight');
  if (!ambient || !sun) return;

  if (mode === 'auto') {
    // Use real sun position
    const sp = getSunPosition();
    const sunPos = latLonToVec3(sp.lat, sp.lon, 20);
    sun.position.copy(sunPos);
    sun.intensity = 1.4;
    ambient.intensity = 0.25;
  } else if (mode === 'day') {
    sun.position.set(15, 8, 10);
    sun.intensity = 1.6;
    ambient.intensity = 0.4;
  } else if (mode === 'night') {
    sun.position.set(-15, -5, -10);
    sun.intensity = 0.3;
    ambient.intensity = 0.08;
  } else if (mode === 'dusk') {
    sun.position.set(-10, 3, 6);
    sun.intensity = 1.0;
    ambient.intensity = 0.3;
    sun.color.setHex(0xffa366);   // warm dusk tint
  }
  if (mode !== 'dusk') sun.color.setHex(0xffffff);
}

// Init the entire 3D globe scene
export async function initGlobe() {
  const canvas = document.getElementById('globeCanvas');
  const w = canvas.parentElement.clientWidth;
  const h = canvas.parentElement.clientHeight;

  scene = new THREE.Scene();
  scene.background = null;     // transparent so CSS bg shows through

  camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 1000);
  camera.position.set(0, 0, 3);

  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  textureLoader = new THREE.TextureLoader();
  textureLoader.crossOrigin = 'anonymous';

  // Orbital controls (drag to rotate, scroll to zoom)
  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.5;
  controls.zoomSpeed = 0.8;
  controls.minDistance = 1.15;
  controls.maxDistance = 8;
  controls.enablePan = false;

  // Ambient light (fills shadows)
  const ambient = new THREE.AmbientLight(0xffffff, 0.25);
  ambient.name = 'ambientLight';
  scene.add(ambient);

  // Sun directional light
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.name = 'sunLight';
  sun.position.set(5, 3, 5);
  scene.add(sun);

  // Load initial Earth texture
  const earthTex = await loadTex(TEXTURES[state.globe.texture]?.diffuse);
  const earthGeo = new THREE.SphereGeometry(EARTH_RADIUS, 96, 72);
  const earthMat = new THREE.MeshPhongMaterial({
    map: earthTex,
    specular: new THREE.Color(0x222233),
    shininess: 12,
  });
  earth = new THREE.Mesh(earthGeo, earthMat);
  earth.name = 'earth';
  scene.add(earth);

  // Atmosphere halo
  atmosphere = buildAtmosphere();
  atmosphere.name = 'atmosphere';
  atmosphere.visible = state.layers.atmosphere;
  scene.add(atmosphere);

  // Starfield
  stars = buildStars();
  stars.name = 'stars';
  stars.visible = state.layers.stars;
  scene.add(stars);

  // Lat/lon grid (off by default)
  grid = buildGrid();
  grid.name = 'grid';
  grid.visible = state.layers.grid;
  scene.add(grid);

  // Setup groups that other modules will populate
  const gNames = ['pilots', 'atc', 'routes', 'navaids', 'airways', 'weather', 'metar', 'fir', 'trails'];
  for (const n of gNames) {
    const g = new THREE.Group();
    g.name = n;
    groups[n] = g;
    scene.add(g);
  }

  // Apply initial lighting based on auto/manual mode
  applyLighting();

  // Handle window resize
  window.addEventListener('resize', onResize);

  // Click handling on the globe
  canvas.addEventListener('click', onGlobeClick);

  // Listen for layer visibility changes from UI
  events.on('layer:toggle', ({ name, visible }) => {
    applyLayerVisibility(name, visible);
  });

  // Listen for texture change
  events.on('globe:texture', async (key) => {
    await applyTexture(key);
  });

  // Listen for time mode change
  events.on('globe:timeMode', () => {
    applyLighting();
  });

  console.log('globe initialized');
}

// Apply a layer visibility change to the scene graph
function applyLayerVisibility(name, visible) {
  const mapping = {
    atc: groups.atc,
    routes: groups.routes,
    weather: [groups.weather, groups.metar],
    navaids: groups.navaids,
    airways: groups.airways,
    fir: groups.fir,
    trails: groups.trails,
    atmosphere,
    stars,
    grid,
  };
  const target = mapping[name];
  if (!target) return;
  if (Array.isArray(target)) {
    target.forEach(t => { if (t) t.visible = visible; });
  } else {
    target.visible = visible;
  }
}

// Raycasting: what did the user click on?
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
function onGlobeClick(ev) {
  const rect = ev.target.getBoundingClientRect();
  mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  // First check aircraft markers
  const acHits = raycaster.intersectObjects(groups.pilots.children, true);
  if (acHits.length > 0) {
    const obj = acHits[0].object;
    const cs = obj.userData?.callsign;
    if (cs) {
      events.emit('select:pilot', cs);
      return;
    }
  }
  // Then ATC
  const atcHits = raycaster.intersectObjects(groups.atc.children, true);
  if (atcHits.length > 0) {
    const obj = atcHits[0].object;
    const cs = obj.userData?.callsign;
    if (cs) {
      events.emit('select:atc', cs);
      return;
    }
  }
  // Otherwise clicked empty space - deselect
  events.emit('select:none');
}

function onResize() {
  const canvas = document.getElementById('globeCanvas');
  const w = canvas.parentElement.clientWidth;
  const h = canvas.parentElement.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

// Focus camera on a specific lat/lon (smooth animation)
export function focusOn(lat, lon, zoom = 2.2) {
  const target = latLonToVec3(lat, lon, zoom);
  const startPos = camera.position.clone();
  const duration = 800;
  const t0 = performance.now();
  function step() {
    const p = Math.min(1, (performance.now() - t0) / duration);
    const e = p < 0.5 ? 2*p*p : 1 - Math.pow(-2*p + 2, 2)/2;
    camera.position.lerpVectors(startPos, target, e);
    camera.lookAt(0, 0, 0);
    controls.update();
    if (p < 1) requestAnimationFrame(step);
  }
  step();
}

// Main render loop - runs at display refresh rate (usually 60fps)
let frameCount = 0;
let fpsTime = performance.now();
export function renderLoop() {
  requestAnimationFrame(renderLoop);

  controls.update();

  // Auto-rotate when idle
  if (state.globe.autoRotate && earth) {
    earth.rotation.y += 0.0008;
  }

  // Auto-update lighting if in auto time mode
  if (state.globe.timeMode === 'auto' && frameCount % 60 === 0) {
    applyLighting();
  }

  renderer.render(scene, camera);

  // FPS tracking
  frameCount++;
  const now = performance.now();
  if (now - fpsTime >= 1000) {
    state.perf.fps = frameCount;
    frameCount = 0;
    fpsTime = now;
  }

  // Update footer coords/zoom
  updateFooterStats();

  // Emit frame event for animation systems (aircraft interpolation)
  events.emit('frame', now);
}

let _lastFootUpdate = 0;
function updateFooterStats() {
  const now = performance.now();
  if (now - _lastFootUpdate < 200) return;
  _lastFootUpdate = now;
  const dist = camera.position.length();
  const zoomEl = document.getElementById('footZoom');
  if (zoomEl) zoomEl.textContent = `zoom ${(3 / dist).toFixed(1)}x`;
}
