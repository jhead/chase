---
name: verify-render
description: Run the NEXRAD-3D test harness to verify the current rendering quality, then act on the feedback.
---

## How to use this skill

Invoke as: `/verify-render [mode] [site] [extra_prompt]`
- `mode`: sweeps | isosurface | combined (default: isosurface)
- `site`: radar site code (default: KHTX)
- `extra_prompt`: optional extra question passed to Gemini

## What to do

1. Run the test harness using the Bash tool:
   ```
   cd /Users/jhead/dev/chase/nexrad-3d && bash test_harness.sh {site} {mode} "{extra_prompt}"
   ```
   If no args were given, default to: `bash test_harness.sh KHTX isosurface`

2. Read the Gemini analysis output carefully. It evaluates:
   - **Structural integrity**: aliasing, gaps between tilts, blurring quality
   - **Color mapping accuracy**: reflectivity thresholds vs NWS scale
   - **Artifacts**: voxelization, mesh manifold issues

3. Summarize the key findings to the user in plain text — what looks good and what needs work.

4. If there are actionable issues, propose specific code changes to address them. The relevant source files are:
   - `src/main.rs` — app setup, render modes, screenshot logic
   - `src/rendering/isosurface.rs` — marching cubes / isosurface generation
   - `src/rendering/elevation_mesh.rs` — sweep cone mesh geometry
   - `src/rendering/radar_material.rs` — materials and shaders
   - `src/rendering/radar_texture.rs` — reflectivity texture / color mapping
   - `src/nexrad/` — data parsing and types

5. After making any changes, re-run the harness to verify improvement. Repeat until the rendering is clean.

## Enhancing the harness itself

If new render modes or CLI flags are added to the app (e.g., new `-m` options), update `test_harness.sh` accordingly — add new modes to the usage string and ensure the output filename captures the mode. The harness should always exercise whatever modes are currently active in the app.
