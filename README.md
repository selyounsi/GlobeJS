# GlobeJS

A drop-in 3D world globe in your brand colors — rotating, draggable, with named
hubs, animated connection lines and live theming. Wraps
[globe.gl](https://github.com/vasturiano/globe.gl) in a small,
configuration-driven class.

**Live demo:** https://selyounsi.github.io/GlobeJS/demo/  
**Minimal example:** https://selyounsi.github.io/GlobeJS/demo/minimal.html

## Features

- **Brand-colored sphere** — fully configurable globe, accent, atmosphere, stroke,
  hub and arc colors
- **Triangulated continents** — country meshes overlaid with a low-poly wireframe
- **Hubs as pins** — drop named markers with optional per-hub color; hover for
  tooltips, click to fly the camera there
- **Explicit connections** — solid lines between hubs by `name`; supports
  hub-to-many (e.g. Berlin → [NYC, Tokyo, London])
- **Drag + auto-rotate** — pinch / drag overrides auto-rotation seamlessly
- **Configurable framing** — `padding`, `overflow` and `scale` control how the
  globe sits inside its container and whether arcs can extend beyond it
- **Responsive** — sizes itself to its parent element, no fixed dimensions
- **Live setters** — all colors, sizes, toggles, hubs and connections update at
  runtime with no rebuild — no flicker
- **One bundled file** — ship `dist/main.min.js` and `dist/main.min.css`, that's it

## Quick start

Copy `dist/main.min.js` and `dist/main.min.css` into your project, then:

```html
<link rel="stylesheet" href="main.min.css">

<div id="globe-container" style="width: 100vw; height: 100vh;"></div>

<script src="main.min.js"></script>
<script>
    new BrandGlobe({ container: '#globe-container' });
</script>
```

That's it. `main.min.js` bundles globe.gl, topojson-client, the country topology
data and the `BrandGlobe` class into a single file.

## Configuration reference

All options shown with their defaults:

```js
new BrandGlobe({
    container: '#globe-container',

    padding:  18,   // px safe-area between the visible globe and the container edges
    overflow: 80,   // px extra render area outside the container — lets arcs break out
    scale:    1,    // visual size of the sphere — 1 = normal, 0.8 = smaller, 1.2 = larger

    colors: {
        globe:      '#004972',                  // sphere color
        accent:     '#F39323',                  // country fill color
        stroke:     'rgba(255, 184, 92, 0.95)', // country border line
        atmosphere: '#1d6791',                  // outer glow
        arcStart:   'rgba(255, 170, 60, 1)',    // arc gradient start
        arcEnd:     'rgba(255, 170, 60, 1)',    // arc gradient end (= solid line if equal)
        hubPoint:   '#ffffff',                  // hub pin color
        hubRing:    '#ffffff'                   // pulsating ring color
    },

    globe:       { opacity: 1.0, shininess: 14 },
    atmosphere:  { enabled: true, altitude: 0.22 },
    rotation:    { enabled: true, speed: 0.55 },
    interaction: { enabled: true },
    initialView: { lat: 18, lng: 18, altitude: 1.7 },

    polygons: {
        enabled:    true,
        style:      'filled',   // 'filled' or 'hex'
        altitude:   0.008,
        capOpacity: 0.88,
        wireframe:  { enabled: true, color: '#ffffff', opacity: 0.55 }
    },

    arcs:   { enabled: true, strokeWidth: 0.55, dashLength: 1, dashGap: 0, animateTime: 0, altitudeAutoScale: 0.45 },
    points: { enabled: true, radius: 0.55, altitude: 0.01 },
    rings:  { enabled: true, maxRadius: 3, propagationSpeed: 1.6, repeatPeriod: 1800 },

    hubs: [
        { name: 'Berlin', lat: 52.52,   lng: 13.405,   color: '#ff5e7e' /* optional */ },
        { name: 'Tokyo',  lat: 35.6762, lng: 139.6503 }
    ],

    connections: [
        { from: 'Berlin', to: 'Tokyo' }
    ]
});
```

## Hub & connection model

Hubs are objects with `name`, `lat`, `lng` — and an optional per-hub `color`:

```js
hubs: [
    { name: 'Berlin',   lat: 52.52,   lng: 13.405 },
    { name: 'New York', lat: 40.7128, lng: -74.006, color: '#ff5e7e' }
]
```

Connections reference hubs by their `name`. The `to` field accepts a single
name or an array (hub-to-many):

```js
connections: [
    { from: 'Berlin', to: 'New York' },                  // 1 → 1
    { from: 'Berlin', to: ['Tokyo', 'New York'] }        // 1 → many
]
```

Unknown names trigger a console warning and are skipped.

## Runtime API

The returned `BrandGlobe` instance supports live updates without a rebuild:

```js
const g = new BrandGlobe({ /* ... */ });

// Colors
g.setGlobeColor('#0a0a0a');
g.setAccentColor('#00d4ff');
g.setStrokeColor('#ffb85c');
g.setAtmosphereColor('#1e293b');
g.setWireframeColor('#ffffff');
g.setHubColor('#ffffff');
g.setArcColor('#ffaa3c');

// Sliders / numbers
g.setGlobeOpacity(0.9);
g.setWireframeOpacity(0.6);
g.setScale(0.8);              // animated, 300 ms
g.setPadding(24);
g.setOverflow(120);
g.setRotationSpeed(1.5);

// Layer toggles
g.setRotation(false);
g.setInteraction(true);
g.setAtmosphereEnabled(true);
g.setWireframeEnabled(true);
g.setBordersEnabled(true);    // toggle country border lines only
g.setPointsEnabled(true);
g.setRingsEnabled(true);
g.setArcsEnabled(true);

// Data
g.setHubs([ /* ... */ ]);
g.setConnections([ /* ... */ ]);
g.refreshArcs();

// Camera
g.flyTo('Berlin');            // by hub name
g.flyTo({ lat: 0, lng: 0 });  // by coordinates

// Events
g.onClick(({ lat, lng }) => console.log('clicked', lat, lng));

g.destroy();
```

## Project layout

```
GlobeJS/
├── package.json            npm scripts (build, watch)
├── scripts/
│   └── build.js            Bundles vendor + src into dist/
├── src/                    Source — edit these
│   ├── brand-globe.js
│   └── main.css
├── vendor/                 Third-party libraries
│   ├── globe.gl.min.js
│   ├── topojson-client.min.js
│   └── countries-110m.js
├── dist/                   Built outputs — ship these
│   ├── main.min.js         Bundled (vendor + brand-globe)
│   └── main.min.css
└── demo/
    ├── index.html          Interactive playground (themes, hub editor, search)
    └── minimal.html        Zero-config example
```

## Build

```bash
npm install
npm run build     # one-off build into dist/
npm run watch     # rebuild on file change
```

`scripts/build.js` minifies `src/brand-globe.js` via esbuild and concatenates it
with the (already minified) vendor libraries into a single `dist/main.min.js`.

## Dependencies

| Library         | Version | Purpose                                       | Source |
|-----------------|---------|-----------------------------------------------|--------|
| globe.gl        | 2.32.0  | 3D globe (wraps three.js + three-globe)       | https://github.com/vasturiano/globe.gl |
| topojson-client | 3.1.0   | Decodes the TopoJSON country boundary data    | https://github.com/topojson/topojson-client |
| world-atlas     | 2.0.2   | Country boundary dataset (`countries-110m`)   | https://github.com/topojson/world-atlas |
| esbuild         | ^0.23.0 | Minifies our source during build              | https://esbuild.github.io |

The playground additionally uses [Tailwind CSS via CDN](https://cdn.tailwindcss.com)
for styling and [Nominatim](https://nominatim.openstreetmap.org/) for place search
— neither is required by the library itself.

## Browser support

Anything that supports WebGL and ES2015+. Tested on current Chromium, Firefox
and Safari.

## License

The wrapper code (`src/`, `demo/`, `scripts/`) is offered without restriction.
The vendored libraries retain their original licenses — see each library's
repository for details.
