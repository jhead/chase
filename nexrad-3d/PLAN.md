# Bevy 3D NEXRAD Radar Visualization — Implementation Plan

## Context

The existing `chase` project is a React/TypeScript web app that renders NEXRAD Level 2 reflectivity data as a 2D polar WebGL texture (720 rays × 2000 gates, single elevation, no 3D). Professional storm chasers need to see radar data volumetrically — multiple elevation scans simultaneously in 3D space, overlaid on a map, with fast pan/zoom/tilt. This plan creates a new standalone Rust/Bevy desktop application from scratch.

---

## Architecture Overview

```
/Users/jhead/dev/nexrad-3d/   (new standalone Rust app, sibling to /chase)
```

**Rendering strategy:** One triangle-fan cone mesh + one R32F texture per elevation scan. Fragment shader colorizes using NWS colormap. ~15-20 draw calls total per volume. GPU-efficient, trivially extensible.

**Data pipeline:** `reqwest` + `IoTaskPool` for async fetch → `nexrad-decode` for NEXRAD L2 binary parsing → `async-channel` to transfer `RadarVolume` back to main thread → `wgpu`/Bevy texture upload.

**Map:** `bevy_slippy_tiles` or `bevy_geo_tiles` for OSM tiles on flat ground plane at Y=0.

**Coordinates:** Local ENU Cartesian (East-North-Up, meters) centered on the selected radar site.

---

## Project Structure

```
nexrad-3d/
├── Cargo.toml
├── assets/shaders/
│   ├── radar_elevation.wgsl      # Cone mesh fragment + vertex shader
│   └── colormap.wgsl             # NWS reflectivity colormap (shared include)
└── src/
    ├── main.rs                   # App setup, plugin registration
    ├── plugins/
    │   ├── radar_plugin.rs       # Top-level data + rendering orchestration
    │   ├── camera_plugin.rs      # Orbit camera
    │   ├── map_plugin.rs         # Map tiles ground plane
    │   └── ui_plugin.rs          # egui panels
    ├── nexrad/
    │   ├── client.rs             # HTTP: list S3 files, fetch raw binary
    │   ├── parser.rs             # nexrad-decode → RadarVolume structs
    │   ├── types.rs              # RadarVolume, ElevationScan, RadarSite
    │   └── beam_height.rs        # 4/3 Earth model beam height formula
    ├── rendering/
    │   ├── elevation_mesh.rs     # Builds Mesh for one elevation scan
    │   ├── radar_material.rs     # Custom Material (AsBindGroup)
    │   ├── radar_texture.rs      # R32F 2D texture create/update
    │   └── volume_renderer.rs    # System: spawn/update per-elevation entities
    ├── camera/
    │   └── orbit_camera.rs       # Pan/zoom/orbit controller (Google Earth style)
    ├── ui/
    │   ├── site_selector.rs      # egui site combo box (125+ NEXRAD sites)
    │   ├── elevation_filter.rs   # egui elevation angle checkboxes
    │   ├── time_scrubber.rs      # Bottom bar: frame slider + playback speed
    │   └── colormap_legend.rs    # dBZ gradient bar
    └── state/
        ├── app_state.rs          # AppState enum (Loading / Viewing)
        └── radar_state.rs        # Resources: site, volumes, time index, visibility
```

---

## Key Dependencies (Cargo.toml)

```toml
bevy = { version = "0.15", features = ["dynamic_linking"] }
bevy_egui = "0.31"
bevy_slippy_tiles = "0.7"         # OSM slippy map tiles on ground plane
nexrad-data = "0.x"               # NOAA S3 file listing + download
nexrad-decode = "0.x"             # NEXRAD Level 2 binary parsing
nexrad-model = "0.x"              # RadarFile, Radial, DataMoment types
reqwest = { version = "0.12", features = ["json"] }
tokio = { version = "1", features = ["rt-multi-thread"] }
async-channel = "2"
```

> Note: Verify Bevy version at implementation time (0.15 as of early 2026; 0.18 may be available).

---

## Critical Implementation Details

### 1. NEXRAD Data Source

Reuse the existing CF Worker proxy from `/chase/workers/nexrad/`:
- **File listing:** `GET http://localhost:8787/s3/noaa-nexrad-level2/{YYYY/MM/DD}/{RADAR}/` → S3 XML list response, filter `_V06` suffix, sort descending by timestamp in filename
- **File fetch:** `GET http://localhost:8787/s3/noaa-nexrad-level2/{key}` → raw binary NEXRAD L2 file
- Parse with `nexrad-decode` in `IoTaskPool` background thread

### 2. Reflectivity Normalization

Match the existing app exactly:
```rust
// Equivalent to: moment_data[i] / 75 in Radar.tsx
let normalized = (dbz_value as f32 / 75.0).clamp(0.0, 1.0);
```
The `nexrad-decode` `DataMoment` values may need `raw * scale + offset` → actual dBZ first.

### 3. Beam Height (4/3 Earth Model)

```rust
// src/nexrad/beam_height.rs
const KE: f64 = 4.0 / 3.0;
const RE_KM: f64 = 6371.0;

pub fn beam_height_m(range_m: f64, elev_deg: f64) -> f64 {
    let r = range_m / 1000.0;
    let ke_re = KE * RE_KM;
    let theta = elev_deg.to_radians();
    let h_km = (r*r + ke_re*ke_re + 2.0*r*ke_re*theta.sin()).sqrt() - ke_re;
    h_km * 1000.0
}

pub fn polar_to_enu(range_m: f64, azimuth_deg: f64, elev_deg: f64) -> Vec3 {
    let h = beam_height_m(range_m, elev_deg);
    let ground_range = range_m * elev_deg.to_radians().cos();
    let az = azimuth_deg.to_radians();
    Vec3::new((ground_range * az.sin()) as f32, h as f32, (ground_range * az.cos()) as f32)
}
```

### 4. Elevation Mesh Construction

Per elevation: build a `(num_rays+1) × (num_gates+1)` vertex grid in 3D world space. UV coordinates: `u = gate_idx / num_gates`, `v = ray_idx / num_rays`. The R32F texture (width=num_gates, height=num_rays) is sampled at these UVs in the fragment shader. 2 triangles per quad cell.

For 720 rays × 1832 gates × 20 elevations ≈ 53M triangles total — implement LOD: when camera radius > 400km, halve mesh resolution.

### 5. WGSL Shader

Port the NWS colormap from `/Users/jhead/dev/chase/src/components/Radar/fragment.glsl` (5 color bands, piecewise linear) verbatim to WGSL. Discard fragments where `raw_value <= 0.0` (no-data). Enable `AlphaMode::Blend` on the material.

Critical source to port: `/Users/jhead/dev/chase/src/components/Radar/fragment.glsl`

### 6. Camera (Orbit)

`OrbitCamera` component with `focus: Vec3`, `radius: f32`, `yaw: f32`, `pitch: f32`:
- Left drag → orbit (yaw + pitch, clamp pitch 5°–89°)
- Right drag → pan (translate focus on ground plane)
- Scroll → zoom (radius)

### 7. Entity Hierarchy

```
RadarVolumePivot (Transform = radar site position)
  └── ElevationScan_0 … ElevationScan_N  (one per elevation angle)
        Handle<Mesh> + Handle<RadarMaterial> + Visibility
MapGroundPlane (bevy_slippy_tiles)
```

On site change: despawn `RadarVolumePivot` + all children, spawn fresh hierarchy.

### 8. Radar Site List

Port `/Users/jhead/dev/chase/src/data/radarSites.ts` (125+ NEXRAD sites with id/name/lat/lng) to a Rust const/embedded JSON in `src/state/radar_state.rs`.

---

## Implementation Phases

### Phase 1 — Static Render (bootstrap)
- Create project, add deps
- Implement `beam_height.rs` with unit tests
- Build fake `ElevationScan` with gradient dummy data
- Render one elevation cone mesh with `OrbitCamera`
- Verify: colored cone tilted at 0.5°, orbitable

### Phase 2 — Real NEXRAD Data
- Implement `client.rs` (list + fetch via localhost:8787)
- Implement `parser.rs` wrapping `nexrad-decode`
- Wire `IoTaskPool` async channel
- Replace dummy data with real parsed data (KHTX default)

### Phase 3 — Multi-Elevation Volume
- Spawn all elevation scans as separate entities
- Verify "birthday cake" cone-of-cones shape
- Add elevation visibility toggle

### Phase 4 — Map Ground Plane
- Add `bevy_slippy_tiles`
- Verify geographic alignment (radar site icon matches lat/lng on map)

### Phase 5 — Full UI + Real-Time
- egui side panel: site selector, elevation filter
- Bottom bar: time scrubber, playback (0.5×/1×/2×/4×)
- Top-right: colormap legend (dBZ scale)
- Real-time polling: check for new frames every 2 minutes

### Phase 6 — Polish
- LOD mesh variants at low zoom
- Bevy `DiagnosticsPlugin` for FPS monitoring
- Verify Metal backend on macOS

---

## Verification

1. **Geometry:** Orbit to side view — see cone shape tilted at correct elevation angle. At 0.5° elevation, beam at 460km range should be ~4km altitude.
2. **Data accuracy:** Compare reflectivity colors with the existing React app for same site/time — colors must match (same NWS colormap, same normalization).
3. **Performance:** `LogDiagnosticsPlugin` should show ≥30 FPS with all 20 elevations visible.
4. **Real-time:** Change radar site → old volume despawns → new data fetches in background → appears within ~5 seconds.
5. **Map alignment:** Pan map under KHGX (Houston) — coastline of Galveston Bay should appear directly under the radar cone origin.
