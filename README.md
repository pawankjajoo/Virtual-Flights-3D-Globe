# Virtual Flights Map 3D Globe

A smooth, beautiful 3D globe visualization of real-time virtual flight traffic from VATSIM, IVAO, and POSCON networks, powered by Mapbox GL JS with native globe projection.

## Features

- **3D Rotating Globe**: Smooth Mapbox GL JS globe projection with realistic geography
- **Multi-Network Support**: Displays pilots from VATSIM, IVAO, and POSCON simultaneously
- **Aircraft Markers**: Colored by aircraft type (Heavy, Medium, Light Jet, General Aviation)
- **ATC Coverage**: Toggle circles showing active ATC stations worldwide
- **Aircraft Search**: Find any flight by callsign or search ATC frequencies
- **Flight Information Panel**: Click any aircraft for detailed info (altitude, speed, heading, route, remarks)
- **Live Statistics**: Real-time pilot and ATC counts with connection status
- **Layer Toggles**: Show/hide ATC, Routes, Weather, FIR zones
- **Interactive Controls**: Drag to rotate, scroll to zoom, buttons for reset and layer control
- **Live Updates**: Data refreshes every 10 seconds
- **Responsive Design**: Works on desktop and mobile with dark cockpit theme
- **ATIS Voice**: Click ATC station to hear ATIS information read aloud (text-to-speech)

## Data Sources

- **VATSIM**: https://data.vatsim.net/v3/vatsim-data.json
- **IVAO**: https://api.ivao.aero/v2/tracker/whazzup (optional CORS proxy)
- **POSCON**: Similar real-time API endpoints

## Technical Stack

- **Mapbox GL JS v3.3.0** with native globe projection
- **Dark mode map style** (mapbox://styles/mapbox/dark-v11)
- **Custom aircraft and ATC markers** using SVG and DOM elements
- **Real-time API data fetching** with error handling
- **Responsive design** with CSS Grid and Flexbox
- **Dark cockpit theme** with cyan accents and smooth animations

## Usage

Open `index.html` in a modern web browser (Chrome, Firefox, Safari, Edge 85+).

### Controls

- **Drag Mouse**: Rotate globe freely
- **Scroll Wheel**: Zoom in/out smoothly
- **Click Aircraft**: View flight details in info drawer
- **Click ATC Circle**: View controller info and hear ATIS
- **Search Box**: Find flights by callsign or ATC by frequency
- **Layer Toggles** (left side):
  - ATC: Toggle active ATC circles
  - Routes: Toggle aircraft markers
  - WX: Weather layer (placeholder)
  - FIR: FIR zone layer (placeholder)
- **Legend** (bottom left): Aircraft type legend
- **ATIS Button** (bottom left): Voice control for ATIS
- **Map Controls** (bottom right): Zoom +/-, Reset view

### Aircraft Color Legend

- **Light Blue (#38bdf8)**: Heavy aircraft (747, A380, A350, 777)
- **Purple (#a78bfa)**: Medium aircraft (A320, 737, 757)
- **Pink (#f472b6)**: Light jets (Citation, Gulfstream)
- **Orange (#fb923c)**: General aviation (Cessna, Piper)

### UI Components

- **Header**: Pushstart Sims branding, live stats (pilots, ATC, connection status)
- **Search Box**: Find any flight or controller by callsign
- **Side Panel**: List of all active pilots or controllers, sortable
- **Info Drawer**: Detailed flight information (tabs for Info, Route)
- **Welcome Popup**: Introduction and feature guide on first visit
- **Footer**: Connection status, data source attribution, coordinates

## Browser Compatibility

Requires:
- Mapbox GL JS compatible browser (Chrome 51+, Firefox 55+, Safari 11+, Edge 79+)
- JavaScript ES6 support
- CORS-enabled APIs

## Performance Notes

- Optimized for real-time updating with 10-second refresh cycle
- Smooth 60 FPS globe rotation when idle
- Efficient marker creation and removal
- VATSIM API rate limit friendly (1 req per 10s)

## File Details

- `index.html`: Single self-contained file with all HTML, CSS, and JavaScript (1,352 lines)
- Embedded Mapbox GL JS library via CDN
- No external dependencies or build process required
- Ready to deploy to any static web server

---

Developed by Pawan K Jajoo | Built with Mapbox GL JS
