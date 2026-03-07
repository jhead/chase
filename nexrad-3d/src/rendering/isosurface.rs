use bevy::{
    asset::RenderAssetUsages,
    mesh::{Indices, PrimitiveTopology},
    prelude::*,
};
use lin_alg::f32::Vec3 as LinVec3;
use mcubes::{MarchingCubes, MeshSide};

use crate::nexrad::{beam_height::polar_to_world, types::ElevationScan};

/// dBZ thresholds for nested isosurfaces: (threshold_dBZ, alpha).
/// Outer shell is transparent; inner core is nearly opaque.
const THRESHOLDS: &[(f32, f32)] = &[
    (20.0, 0.20),
    (35.0, 0.60),
    (50.0, 0.92),
];

#[derive(Debug, Clone)]
pub struct IsoMeshData {
    pub positions: Vec<[f32; 3]>,
    pub normals: Vec<[f32; 3]>,
    pub colors: Vec<[f32; 4]>,
    pub indices: Vec<u32>,
}

impl IsoMeshData {
    pub fn into_mesh(self) -> Mesh {
        let mut mesh = Mesh::new(
            PrimitiveTopology::TriangleList,
            RenderAssetUsages::RENDER_WORLD,
        );
        mesh.insert_attribute(Mesh::ATTRIBUTE_POSITION, self.positions);
        mesh.insert_attribute(Mesh::ATTRIBUTE_NORMAL, self.normals);
        mesh.insert_attribute(Mesh::ATTRIBUTE_COLOR, self.colors);
        mesh.insert_indices(Indices::U32(self.indices));
        mesh
    }
}

/// Official NWS reflectivity colormap. Input: normalized [0, 1] (1.0 = 75 dBZ).
fn nws_colormap(v: f32, alpha: f32) -> [f32; 4] {
    let dbz = v * 75.0;
    let rgb = if dbz < 5.0 {
        [0.0, 0.925, 0.925]    // #00ECEC
    } else if dbz < 10.0 {
        [0.0, 0.925, 0.925]    // #00ECEC
    } else if dbz < 15.0 {
        [0.004, 0.627, 0.965]  // #01A0F6
    } else if dbz < 20.0 {
        [0.0, 0.0, 0.965]      // #0000F6
    } else if dbz < 25.0 {
        [0.0, 1.0, 0.0]        // #00FF00
    } else if dbz < 30.0 {
        [0.0, 0.784, 0.0]      // #00C800
    } else if dbz < 35.0 {
        [0.0, 0.565, 0.0]      // #009000
    } else if dbz < 40.0 {
        [0.973, 0.973, 0.0]    // #F8F800
    } else if dbz < 45.0 {
        [0.906, 0.753, 0.0]    // #E7C000
    } else if dbz < 50.0 {
        [1.0, 0.565, 0.0]      // #FF9000
    } else if dbz < 55.0 {
        [1.0, 0.0, 0.0]        // #FF0000
    } else if dbz < 60.0 {
        [0.839, 0.0, 0.0]      // #D60000
    } else if dbz < 65.0 {
        [0.753, 0.0, 0.0]      // #C00000
    } else if dbz < 70.0 {
        [1.0, 0.0, 1.0]        // #FF00FF
    } else {
        [0.6, 0.333, 0.788]    // #9955C9
    };
    [rgb[0], rgb[1], rgb[2], alpha]
}

/// Separable 3D max-pool dilation. Spreads peak values outward without
/// diluting them (unlike average blur which destroys sparse signals).
/// Grid layout: index(x, y, z) = x + y*nx + z*nx*ny
fn dilate_3d(grid: &mut Vec<f32>, nx: usize, ny: usize, nz: usize, radius: usize) {
    let idx = |x: usize, y: usize, z: usize| x + y * nx + z * nx * ny;
    let mut tmp = vec![0.0_f32; nx * ny * nz];

    for z in 0..nz {
        for y in 0..ny {
            for x in 0..nx {
                let lo = x.saturating_sub(radius);
                let hi = (x + radius).min(nx - 1);
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

    for z in 0..nz {
        for y in 0..ny {
            for x in 0..nx {
                let lo = y.saturating_sub(radius);
                let hi = (y + radius).min(ny - 1);
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

    for z in 0..nz {
        for y in 0..ny {
            for x in 0..nx {
                let lo = z.saturating_sub(radius);
                let hi = (z + radius).min(nz - 1);
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

/// 3D separable box blur (average). Used after dilation for surface smoothness.
/// Grid layout: index(x, y, z) = x + y*nx + z*nx*ny
fn box_blur_3d(grid: &mut Vec<f32>, nx: usize, ny: usize, nz: usize, radius: usize) {
    let idx = |x: usize, y: usize, z: usize| x + y * nx + z * nx * ny;
    let mut tmp = vec![0.0_f32; nx * ny * nz];

    for z in 0..nz {
        for y in 0..ny {
            for x in 0..nx {
                let lo = x.saturating_sub(radius);
                let hi = (x + radius).min(nx - 1);
                let mut sum = 0.0_f32;
                let mut count = 0u32;
                for xx in lo..=hi { sum += grid[idx(xx, y, z)]; count += 1; }
                tmp[idx(x, y, z)] = sum / count as f32;
            }
        }
    }
    grid.copy_from_slice(&tmp);

    for z in 0..nz {
        for y in 0..ny {
            for x in 0..nx {
                let lo = y.saturating_sub(radius);
                let hi = (y + radius).min(ny - 1);
                let mut sum = 0.0_f32;
                let mut count = 0u32;
                for yy in lo..=hi { sum += grid[idx(x, yy, z)]; count += 1; }
                tmp[idx(x, y, z)] = sum / count as f32;
            }
        }
    }
    grid.copy_from_slice(&tmp);

    for z in 0..nz {
        for y in 0..ny {
            for x in 0..nx {
                let lo = z.saturating_sub(radius);
                let hi = (z + radius).min(nz - 1);
                let mut sum = 0.0_f32;
                let mut count = 0u32;
                for zz in lo..=hi { sum += grid[idx(x, y, zz)]; count += 1; }
                tmp[idx(x, y, z)] = sum / count as f32;
            }
        }
    }
    grid.copy_from_slice(&tmp);
}

/// Shared grid state built once and reused for all threshold extractions.
struct GridState {
    /// Scalar reflectivity field (post-dilation + blur).
    grid: Vec<f32>,
    /// Pre-dilation grid for accurate vertex coloring (actual peak values).
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

    // Grid dims: horizontal 250×250, vertical 90.
    // At ~460km range: dx = dz ≈ 3.7km/cell, dy ≈ max_height/90.
    let nx = 250usize;
    let nz_dim = 250usize; // Bevy Z maps to grid Y axis (second index)
    let ny_dim = 90usize;  // Bevy Y (vertical) maps to grid Z axis (third index)
    let half_extent = max_range_m;
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

    info!(
        "Isosurface grid: max_val={:.3}, dims={}×{}×{}",
        max_val, nx, nz_dim, ny_dim
    );

    // Save pre-dilation grid for accurate vertex coloring.
    let raw_grid = scalar_grid.clone();

    // Dilation: spread peak values into neighboring cells so the isosurface
    // threshold is met across the volume (replaces old average-blur approach
    // which was diluting sparse peaks below threshold).
    dilate_3d(&mut scalar_grid, nx, nz_dim, ny_dim, 3);

    // Single light smooth blur for mesh surface quality.
    box_blur_3d(&mut scalar_grid, nx, nz_dim, ny_dim, 1);

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

/// Sample the raw (pre-dilation) grid at Bevy world coords via trilinear interpolation.
fn sample_raw(state: &GridState, bx: f32, by: f32, bz: f32) -> f32 {
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

    let c000 = state.raw_grid[idx(x0, z0, y0)];
    let c100 = state.raw_grid[idx(x1, z0, y0)];
    let c010 = state.raw_grid[idx(x0, z1, y0)];
    let c110 = state.raw_grid[idx(x1, z1, y0)];
    let c001 = state.raw_grid[idx(x0, z0, y1)];
    let c101 = state.raw_grid[idx(x1, z0, y1)];
    let c011 = state.raw_grid[idx(x0, z1, y1)];
    let c111 = state.raw_grid[idx(x1, z1, y1)];

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
    info!(
        "MC @ {:.0} dBZ: {} verts, {} indices",
        threshold_norm * 75.0,
        mesh.vertices.len(),
        mesh.indices.len()
    );

    if mesh.indices.is_empty() {
        return None;
    }

    // Inward step to sample the reflectivity behind the threshold surface.
    let inward_step = dx * 1.5;

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

            // Step inward to find actual reflectivity behind the surface.
            let ix = bx - (bnx / len) * inward_step;
            let iy = by - (bny / len) * inward_step;
            let iz = bz - (bnz / len) * inward_step;

            let val = sample_raw(state, ix, iy, iz);
            nws_colormap(val, alpha)
        })
        .collect();
    let indices: Vec<u32> = mesh.indices.iter().map(|&i| i as u32).collect();

    Some(IsoMeshData { positions, normals, colors, indices })
}

/// Build the scalar grid once and extract nested isosurfaces at multiple dBZ thresholds.
/// Returns meshes ordered from outermost (lowest dBZ) to innermost (highest dBZ).
pub fn build_threshold_surfaces(scans: &[ElevationScan]) -> Vec<IsoMeshData> {
    let Some(state) = build_grid(scans) else {
        return vec![];
    };

    THRESHOLDS
        .iter()
        .filter_map(|&(dbz, alpha)| extract_surface(&state, dbz / 75.0, alpha))
        .collect()
}
