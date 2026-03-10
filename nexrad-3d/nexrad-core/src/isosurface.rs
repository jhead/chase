use lin_alg::f32::Vec3 as LinVec3;
use mcubes::{MarchingCubes, MeshSide};

use crate::{beam_height::polar_to_world, colormap::color_for_dbz, types::ElevationScan};

/// Single isosurface threshold. One opaque mesh avoids z-fighting that nested
/// transparent shells produce. Vertex colors (sampled inward from the surface)
/// show the internal reflectivity structure — red/yellow where intense cells
/// exist behind the surface, green/cyan at the edges.
const THRESHOLD_DBZ: f32 = 20.0;

/// Platform-agnostic isosurface mesh data — plain vertex arrays with no
/// engine-specific types. Convert to a Bevy `Mesh` via `into_bevy_mesh` in
/// the `nexrad-render` crate.
#[derive(Debug, Clone)]
pub struct IsoMeshData {
    pub positions: Vec<[f32; 3]>,
    pub normals: Vec<[f32; 3]>,
    pub colors: Vec<[f32; 4]>,
    pub indices: Vec<u32>,
}

/// Official NWS reflectivity colormap using the shared JSON LUT.
/// Input: normalized [0, 1] (1.0 = 75 dBZ).
pub fn nws_colormap(v: f32, alpha: f32) -> [f32; 4] {
    let dbz = v * 75.0;
    color_for_dbz(dbz, alpha)
}

/// Separable 3D max-pool dilation with independent radii per axis.
/// Spreads peak values outward without diluting them.
/// Use a small horizontal radius to preserve embedded cell structure and a
/// larger vertical radius to bridge the wide gaps between elevation tilts.
/// Grid layout: index(x, y, z) = x + y*nx + z*nx*ny
fn dilate_3d(
    grid: &mut Vec<f32>,
    nx: usize,
    ny: usize,
    nz: usize,
    rx: usize, // horizontal X radius
    ry: usize, // horizontal Y radius (maps to Bevy Z / North-South)
    rz: usize, // vertical Z radius  (maps to Bevy Y / altitude)
) {
    let idx = |x: usize, y: usize, z: usize| x + y * nx + z * nx * ny;
    let mut tmp = vec![0.0_f32; nx * ny * nz];

    // Dilate along X (East-West)
    for z in 0..nz {
        for y in 0..ny {
            for x in 0..nx {
                let lo = x.saturating_sub(rx);
                let hi = (x + rx).min(nx - 1);
                let mut m = 0.0_f32;
                for xx in lo..=hi {
                    let v = grid[idx(xx, y, z)];
                    if v > m { m = v; }
                }
                tmp[idx(x, y, z)] = m;
            }
        }
    }
    grid.copy_from_slice(&tmp);

    // Dilate along Y (North-South)
    for z in 0..nz {
        for y in 0..ny {
            for x in 0..nx {
                let lo = y.saturating_sub(ry);
                let hi = (y + ry).min(ny - 1);
                let mut m = 0.0_f32;
                for yy in lo..=hi {
                    let v = grid[idx(x, yy, z)];
                    if v > m { m = v; }
                }
                tmp[idx(x, y, z)] = m;
            }
        }
    }
    grid.copy_from_slice(&tmp);

    // Dilate along Z (vertical / altitude)
    for z in 0..nz {
        for y in 0..ny {
            for x in 0..nx {
                let lo = z.saturating_sub(rz);
                let hi = (z + rz).min(nz - 1);
                let mut m = 0.0_f32;
                for zz in lo..=hi {
                    let v = grid[idx(x, y, zz)];
                    if v > m { m = v; }
                }
                tmp[idx(x, y, z)] = m;
            }
        }
    }
    grid.copy_from_slice(&tmp);
}

/// Shared grid state built once and reused for all threshold extractions.
struct GridState {
    /// Scalar reflectivity field (post-dilation + blur).
    grid: Vec<f32>,
    /// Pre-dilation grid retained for future GPU-side coloring pipeline.
    #[allow(dead_code)]
    raw_grid: Vec<f32>,
    nx: usize,
    /// Horizontal depth dimension (maps Bevy Z → grid Y axis).
    nz_dim: usize,
    /// Vertical dimension (maps Bevy Y → grid Z axis).
    ny_dim: usize,
    half_extent: f32,
    max_height_m: f32,
    dx: f32,
    dz: f32,
    dy: f32,
}

fn build_grid(scans: &[ElevationScan]) -> Option<GridState> {
    if scans.is_empty() {
        return None;
    }

    let max_range_m = scans
        .iter()
        .map(|s| s.first_gate_m + s.gate_size_m * s.num_gates as f32)
        .fold(0.0_f32, f32::max);
    if max_range_m <= 0.0 {
        return None;
    }

    let max_elev = scans.iter().map(|s| s.elevation_angle).fold(0.0_f32, f32::max);
    let (_, max_height_m, _) = polar_to_world(max_range_m as f64, 0.0, (max_elev + 2.0) as f64);
    let max_height_m = max_height_m.max(8_000.0);

    // Grid dims: horizontal 400×400, vertical 120.
    // At ~460km range: dx = dz ≈ 2.3km/cell, capturing more L2 gate detail.
    let nx = 400usize;
    let nz_dim = 400usize; // Bevy Z maps to grid Y axis (second index)
    let ny_dim = 120usize; // Bevy Y (vertical) maps to grid Z axis (third index)
    // Cap the grid extent at 230 km. L2 super-res scans technically extend to
    // 460 km but at long range the beam altitude exceeds most storm tops and
    // the horizontal gate footprint grows to several km. Limiting to 230 km
    // gives ~1.15 km/cell at 400 grid points — close to the actual 250 m gate
    // spacing — and puts far more grid budget where the storm detail lives.
    let half_extent = max_range_m.min(230_000.0);
    let dx = (2.0 * half_extent) / nx as f32;
    let dz = (2.0 * half_extent) / nz_dim as f32;
    let dy = max_height_m / ny_dim as f32;

    // Grid layout: index = ix + iz * nx + iy * nx * nz_dim
    // where ix ∈ [0, nx), iz ∈ [0, nz_dim), iy ∈ [0, ny_dim)
    let grid_len = nx * nz_dim * ny_dim;
    let idx = |ix: usize, iz: usize, iy: usize| ix + iz * nx + iy * nx * nz_dim;

    let mut scalar_grid = vec![0.0_f32; grid_len];
    let mut max_val = 0.0_f32;

    for scan in scans {
        if scan.num_rays == 0 || scan.num_gates == 0 {
            continue;
        }
        for ray_i in 0..scan.num_rays {
            let az = scan.azimuths[ray_i];
            for gate_i in 0..scan.num_gates {
                let v = scan.reflectivity[ray_i * scan.num_gates + gate_i];
                if v <= 0.005 {
                    continue;
                }
                let range_m = scan.first_gate_m + gate_i as f32 * scan.gate_size_m;
                let (bx, by, bz) = polar_to_world(
                    range_m as f64,
                    az as f64,
                    scan.elevation_angle as f64,
                );

                // Map Bevy (X, Y, Z) → grid (ix, iy, iz)
                // Grid axis 0 (ix): Bevy X (East-West)
                // Grid axis 1 (iz): Bevy Z (North-South)
                // Grid axis 2 (iy): Bevy Y (vertical)
                let fx = (bx + half_extent) / dx;
                let fz = (bz + half_extent) / dz;
                let fy = by / dy;

                if !(0.0..nx as f32).contains(&fx)
                    || !(0.0..nz_dim as f32).contains(&fz)
                    || !(0.0..ny_dim as f32).contains(&fy)
                {
                    continue;
                }

                let ix = fx.floor() as usize;
                let iz = fz.floor() as usize;
                let iy = fy.floor() as usize;

                let cell = &mut scalar_grid[idx(ix, iz, iy)];
                if v > *cell {
                    *cell = v;
                }
                max_val = max_val.max(v);
            }
        }
    }

    log::info!(
        "Isosurface grid: max_val={:.3}, dims={}×{}×{}",
        max_val, nx, nz_dim, ny_dim
    );

    // Save pre-dilation grid for accurate vertex coloring.
    let raw_grid = scalar_grid.clone();

    // Anisotropic max-pool dilation:
    //   Horizontal radius 1 (~1.15 km) — fills azimuthal ray gaps near radar
    //     without smearing fine embedded cells into one another.
    //   Vertical radius 4 (~700 m × 4 = 2.8 km) — bridges altitude gaps between
    //     sparse tilt layers (0.5°→1.5° gap at 100 km ≈ 1.6 km; at 230 km ≈ 6 km).
    dilate_3d(&mut scalar_grid, nx, nz_dim, ny_dim, 1, 1, 4);

    Some(GridState {
        grid: scalar_grid,
        raw_grid,
        nx,
        nz_dim,
        ny_dim,
        half_extent,
        max_height_m,
        dx,
        dz,
        dy,
    })
}

/// Sample the dilated scalar grid at Bevy world coords via trilinear interpolation.
fn sample_dilated(state: &GridState, bx: f32, by: f32, bz: f32) -> f32 {
    let GridState { nx, nz_dim, ny_dim, half_extent, dx, dz, dy, .. } = *state;
    let idx = |ix: usize, iz: usize, iy: usize| ix + iz * nx + iy * nx * nz_dim;

    let gx = ((bx + half_extent) / dx).clamp(0.0, (nx - 1) as f32);
    let gz = ((bz + half_extent) / dz).clamp(0.0, (nz_dim - 1) as f32);
    let gy = (by / dy).clamp(0.0, (ny_dim - 1) as f32);

    let x0 = gx.floor() as usize;
    let z0 = gz.floor() as usize;
    let y0 = gy.floor() as usize;
    let x1 = (x0 + 1).min(nx - 1);
    let z1 = (z0 + 1).min(nz_dim - 1);
    let y1 = (y0 + 1).min(ny_dim - 1);

    let tx = gx - x0 as f32;
    let tz = gz - z0 as f32;
    let ty = gy - y0 as f32;

    let c000 = state.grid[idx(x0, z0, y0)];
    let c100 = state.grid[idx(x1, z0, y0)];
    let c010 = state.grid[idx(x0, z1, y0)];
    let c110 = state.grid[idx(x1, z1, y0)];
    let c001 = state.grid[idx(x0, z0, y1)];
    let c101 = state.grid[idx(x1, z0, y1)];
    let c011 = state.grid[idx(x0, z1, y1)];
    let c111 = state.grid[idx(x1, z1, y1)];

    let c00 = c000 * (1.0 - tx) + c100 * tx;
    let c10 = c010 * (1.0 - tx) + c110 * tx;
    let c01 = c001 * (1.0 - tx) + c101 * tx;
    let c11 = c011 * (1.0 - tx) + c111 * tx;
    let c0 = c00 * (1.0 - tz) + c10 * tz;
    let c1 = c01 * (1.0 - tz) + c11 * tz;
    c0 * (1.0 - ty) + c1 * ty
}

fn extract_surface(state: &GridState, threshold_norm: f32, alpha: f32) -> Option<IsoMeshData> {
    let GridState { nx, nz_dim, ny_dim, half_extent, max_height_m, dx, .. } = *state;

    // mcubes grid layout: (nx, nz_dim, ny_dim) → physical (East, NorthSouth, Up)
    let mc = MarchingCubes::new(
        (nx, nz_dim, ny_dim),
        (2.0 * half_extent, 2.0 * half_extent, max_height_m),
        (nx as f32, nz_dim as f32, ny_dim as f32),
        LinVec3::new(-half_extent, -half_extent, 0.0),
        state.grid.clone(),
        threshold_norm,
    )
    .ok()?;

    let mesh = mc.generate(MeshSide::OutsideOnly);
    log::info!(
        "MC @ {:.0} dBZ: {} verts, {} indices",
        threshold_norm * 75.0,
        mesh.vertices.len(),
        mesh.indices.len()
    );

    if mesh.indices.is_empty() {
        return None;
    }

    // MC output: x=East, y=NorthSouth (Bevy Z), z=Up (Bevy Y)
    // Remap to Bevy: positions[0]=x, positions[1]=z (Bevy Y=Up), positions[2]=y (Bevy Z)
    let positions: Vec<[f32; 3]> = mesh
        .vertices
        .iter()
        .map(|v| [v.posit.x, v.posit.z, v.posit.y])
        .collect();
    let normals: Vec<[f32; 3]> = mesh
        .vertices
        .iter()
        .map(|v| [v.normal.x, v.normal.z, v.normal.y])
        .collect();

    // Walk inward along the negative normal in 10 steps of 0.7 cells each
    // (total depth ≈ 7 grid cells = ~8 km). Take the maximum dilated-grid value
    // found along the ray. This correctly picks up intense cores behind thin or
    // curved surface regions where a single fixed step would miss the peak.
    let step_size = dx * 0.7;
    let colors: Vec<[f32; 4]> = mesh
        .vertices
        .iter()
        .map(|v| {
            let bx = v.posit.x;
            let by = v.posit.z; // MC z → Bevy Y (up)
            let bz = v.posit.y; // MC y → Bevy Z (north/south)

            let bnx = v.normal.x;
            let bny = v.normal.z;
            let bnz = v.normal.y;
            let len = (bnx * bnx + bny * bny + bnz * bnz).sqrt().max(1e-6);
            let nx_n = bnx / len;
            let ny_n = bny / len;
            let nz_n = bnz / len;

            let peak = (0..10)
                .map(|step| {
                    let t = step as f32 * step_size;
                    sample_dilated(state, bx - nx_n * t, by - ny_n * t, bz - nz_n * t)
                })
                .fold(0.0_f32, f32::max);

            nws_colormap(peak, alpha)
        })
        .collect();
    let indices: Vec<u32> = mesh.indices.iter().map(|&i| i as u32).collect();

    Some(IsoMeshData { positions, normals, colors, indices })
}

/// Build the scalar grid and extract a single isosurface.
/// Using one opaque mesh avoids z-fighting between nested transparent shells.
/// The vertex colors (sampled inward from the surface) reveal internal
/// reflectivity structure without any depth-sorting artefacts.
pub fn build_threshold_surfaces(scans: &[ElevationScan]) -> Vec<IsoMeshData> {
    let Some(state) = build_grid(scans) else {
        return vec![];
    };
    extract_surface(&state, THRESHOLD_DBZ / 75.0, 1.0)
        .into_iter()
        .collect()
}
