# Virtual Flights Map 3D Globe

A 3D interactive globe visualization of real-time virtual flight traffic from VATSIM, IVAO, and POSCON networks.

## Features

- **3D Rotating Globe**: Real geography with interactive rotation and zoom
- **Multi-Network Support**: Displays pilots from VATSIM, IVAO, and POSCON simultaneously
- **Altitude-Based Visualization**: Aircraft colored by altitude band (low, medium, high, flight level)
- **Flight Path Arcs**: 3D curved paths showing aircraft routes
- **Day/Night Cycle**: Dynamic lighting based on UTC time
- **Cloud Layers**: Realistic cloud positioning at different altitudes
- **Aircraft Information**: Click any plane for detailed info (callsign, altitude, route, etc.)
- **Interactive Controls**: Drag to rotate, scroll to zoom, toggle layers on/off
- **Live Updates**: Data refreshes every 15 seconds
- **Weather Integration**: METAR data from Aviation Weather

## Data Sources

- **VATSIM**: https://data.vatsim.net/v3/vatsim-data.json
- **IVAO**: https://api.ivao.aero/v2/tracker/whazzup
- **POSCON**: https://hqapi.poscon.net/online.json
- **Weather**: https://aviationweather.gov/api/data/metar

## Technical Stack

- Three.js for 3D rendering
- WebGL via HTML5 Canvas
- Real-time API data fetching with circuit breaker pattern
- Responsive design with dark cockpit theme

## Usage

Open `index.html` in a modern web browser (Chrome, Firefox, Safari, Edge).

### Controls

- **Drag Mouse**: Rotate globe
- **Scroll Wheel**: Zoom in/out
- **Click Aircraft**: View flight details
- **Toggle Buttons**: Show/hide aircraft, paths, weather, clouds

### Color Legend

- Blue: Low altitude (below 10,000 ft)
- Green: Medium altitude (10,000-25,000 ft)
- Yellow: High altitude (25,000-35,000 ft)
- Red: Flight levels (above 35,000 ft)

## Browser Compatibility

Requires WebGL support (all modern browsers from 2015+).

## Performance Notes

- Optimized for up to 5,000 concurrent aircraft
- Circuit breaker prevents API overload
- Local data caching to reduce requests
- Throttled rendering updates
