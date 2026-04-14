# Virtual Flights 3D Globe

Real-time 3D globe tracker for VATSIM, IVAO, and POSCON flight networks. Built with Three.js, no build step needed.

## Features

- Three.js globe with multiple textures (Blue Marble, Night Lights, Dark, Topo)
- Day/night terminator with real sun-tracking lighting, plus manual day/dusk/night modes
- Atmospheric glow shader and procedural starfield
- GPU-instanced aircraft rendering handles 1000+ pilots at 60fps
- VATSIM + IVAO + POSCON batch fetching via Cloudflare worker
- Circuit breaker, exponential backoff, and request deduplication
- 30fps smooth interpolation between data polls (dead reckoning from gs + hdg)
- Aircraft categorization (Heavy/Medium/Light Jet/Regional/GA/Military/Heli) with color coding
- Speed vectors projecting 4 minutes ahead
- Emergency squawk highlighting (7500/7600/7700)
- ATC zones rendered as 3D surface rings with facility-specific colors
- ATIS text-to-speech synthesis
- Search across callsigns, airports, and ATC frequencies
- Side panel with sortable pilots and controllers lists
- Info drawer with tabs (Info / Route / Live data for pilots, Info / ATIS for controllers)
- Layer toggles for ATC, Routes, Weather, Navaids, Airways, FIR zones
- Settings panel with network filters, aircraft filters, performance toggles
- Adaptive polling (30s active, 60s idle, paused when tab hidden)
- Keyboard shortcuts (Ctrl+K search, Esc to close)
- AIRAC cycle computed automatically
- Preferences persisted to localStorage

## Architecture

Single-page app, no build step. Uses native ES modules with Three.js loaded from CDN.

```
index.html     - main entry, UI shell, module bootstrap
css/styles.css - dark cockpit theme, responsive layout
js/state.js    - shared state and event bus
js/globe.js    - Three.js scene, textures, atmosphere, stars, lighting
js/data.js     - VATSIM/IVAO/POSCON fetching, normalization, interpolation
js/aircraft.js - instanced mesh for aircraft markers, speed vectors
js/atc.js      - 3D ATC zone rendering on globe surface
js/ui.js       - search, panel, drawer, settings, keyboard
```

## Upcoming (roadmap)

- Weather layer (RainViewer radar + NOAA METAR markers)
- Flight route rendering (SID/STAR/airways parsing)
- Navaid database (VOR/NDB/Fix markers)
- Airway centerlines
- FIR/UIR boundary polygons
- Flight position trails
- Cloud layer overlay
- Lat/lon grid overlay
- 3D airport markers with runways

## Tech Stack

Three.js 0.160, OrbitControls, WebGL2, native ES modules. No build tools required - just serve the folder.

## Running

Open `index.html` in a modern browser, or serve the folder:

```
python -m http.server 8000
```

Then visit `http://localhost:8000`. Works on Chrome, Firefox, Safari 15+, Edge.

## License

Proprietary - Pushstart LLC

## Author

Pawan K J