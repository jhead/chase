# radish 🫜

A free, open source weather radar for the web. Built for performance, designed to be extended.

**[Live →](https://jhead.github.io/radish)**

---

Radish renders real-time NEXRAD Level II radar data in 3D using a custom Bevy/WebAssembly rendering engine. It's fast, free to use, and built with extensibility in mind.

The goal is a weather radar that runs entirely in a browser and doesn't require a subscription.

## Features

- **Animated radar loop** — play, pause, scrub through radar frames
- **NEXRAD Level II data** — fetched directly from S3, parsed and decompressed client-side
- **NOAA severe weather alerts** — polygon overlays with severity filtering and detail panel
- **Radar site map** — clickable NEXRAD site markers to quickly switch locations
- **3D visualization** — orbit camera with pan, tilt, zoom, and pinch gesture support
- **Multi-layer** — stack multiple radar sites and layers simultaneously

## Architecture

The app is split into a React/TypeScript frontend and a Bevy rendering engine compiled to WebAssembly. They communicate over a simple command/event bus — React sends JSON commands, Rust dispatches events back.

Everything that touches data lives in Rust. The JS layer handles UI only.

### Plugin system

Layers are plugins. Each plugin is a pair:

- **Rust side** — a Bevy `Plugin` that registers systems and handles commands
- **TypeScript side** — a `PluginDefinition` with a sidebar card component and optional hooks

i.e.
```
plugins/
  layer-basemap/       Geographic reference lines
  layer-radar-l2/      NEXRAD L2 reflectivity
  layer-noaa-alerts/   NWS alert polygons
  layer-radar-sites/   Clickable radar site markers
```

### Core crates

```
radish/
  radish-core/     Shared types, NEXRAD parsing, coordinate math
  radish-fetch/    HTTP utilities (S3, NOAA endpoints)
  radish-render/   Bevy plugin system, command bus, camera
  radish-web/      WASM entry point, JS-exported API
  radish-worker/   Second WASM module — runs in a Web Worker for decompression
  radish-cli/      Native debug binary
```

## Stack

- **Rust** + **Bevy 0.18** — rendering engine, compiled to WASM
- **wasm-bindgen** — Rust/JS FFI
- **React 19** + **TypeScript** — UI
- **Vite** — bundler

## Building

```sh
# Build WASM (both modules)
pnpm build:wasm

# Dev server
pnpm dev

# Production build
pnpm build
```

## License

MIT
