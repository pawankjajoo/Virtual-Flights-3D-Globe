# Virtual Flights Map 3D Globe

A smooth, beautiful 3D globe visualization of real-time virtual flight traffic from VATSIM networks, powered by **MapLibre GL JS** (free, open-source, no API key needed) with native globe projection.

## Features

- **3D Rotating Globe**: Smooth MapLibre GL JS v4.7.1 globe projection with realistic geography
- **Real-Time VATSIM**: Live display of all pilots and controllers from VATSIM network
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

- **MapLibre GL JS v4.7.1** with native globe projection (free, open-source, no API key required)
- **Carto dark-matter vector tiles** (free map style, no API key)
- **Custom aircraft and ATC markers** using GeoJSON features
- **Real-time API data fetching** with CORS proxy for VATSIM data
- **Responsive design** with CSS Grid and Flexbox
- **Dark cockpit theme** with cyan accents and smooth animations
- **100% client-side rendering** - no backend required

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

- `index.html`: Single self-contained file with all HTML, CSS, and JavaScript (932 lines)
- MapLibre GL JS v4.7.1 loaded from CDN (no API key needed)
- Carto vector tiles (free, no API key needed)
- No external dependencies or build process required
- Ready to deploy to any static web server
- Works by just opening the HTML file in a browser

---

Developed by Pawan K Jajoo | Built with MapLibre GL JS
