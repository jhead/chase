use bevy::{
    asset::RenderAssetUsages,
    mesh::{Indices, PrimitiveTopology},
    prelude::*,
};
use lin_alg::f32::Vec3 as LinVec3;
use mcubes::{MarchingCubes, MeshSide};

use crate::nexrad::{beam_height::polar_to_world, types::ElevationScan};

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

fn nws_colormap(v: f32) -> [f32; 4] {
    if v <= 0.06 { // < 5 dBZ
        return [0.0, 0.0, 0.0, 0.0];
    }

    let dbz = v * 75.0;

    let rgb = if dbz < 10.0 {
        [0.0, 1.0, 1.0] // Cyan
    } else if dbz < 15.0 {
        [0.0, 0.0, 0.7] // Blue
    } else if dbz < 20.0 {
        [0.0, 0.0, 0.5] // Dark Blue
    } else if dbz < 25.0 {
        [0.0, 1.0, 0.0] // Green
    } else if dbz < 30.0 {
        [0.0, 0.8, 0.0] // Medium Green
    } else if dbz < 35.0 {
        [0.0, 0.6, 0.0] // Dark Green
    } else if dbz < 40.0 {
        [1.0, 1.0, 0.0] // Yellow
    } else if dbz < 45.0 {
        [1.0, 0.8, 0.0] // Dark Yellow
    } else if dbz < 50.0 {
        [1.0, 0.6, 0.0] // Orange
    } else if dbz < 55.0 {
        [1.0, 0.0, 0.0] // Red
    } else if dbz < 60.0 {
        [0.8, 0.0, 0.0] // Medium Red
    } else if dbz < 65.0 {
        [0.6, 0.0, 0.0] // Dark Red
    } else if dbz < 70.0 {
        [1.0, 0.0, 1.0] // Magenta
    } else {
        [0.5, 0.0, 0.5] // Purple
    };

    [rgb[0], rgb[1], rgb[2], 0.95]
}

/// 3D separable box blur on a flat grid with dimensions (nx, ny, nz).
/// `radius` is the half-width of the box kernel along each axis.
fn box_blur_3d(
    grid: &mut Vec<f32>,
    nx: usize,
    ny: usize,
    nz: usize,
    radius: usize,
) {
    let index = |x: usize, y: usize, z: usize| -> usize { x + y * nx + z * nx * ny };
    let len = nx * ny * nz;
    let mut tmp = vec![0.0_f32; len];

    // Blur along X
    for z in 0..nz {
        for y in 0..ny {
            for x in 0..nx {
                let mut sum = 0.0_f32;
                let mut count = 0u32;
                let lo = x.saturating_sub(radius);
                let hi = (x + radius).min(nx - 1);
                for xx in lo..=hi {
                    sum += grid[index(xx, y, z)];
                    count += 1;
                }
                tmp[index(x, y, z)] = sum / count as f32;
            }
        }
    }
    grid.copy_from_slice(&tmp);

    // Blur along Y
    for z in 0..nz {
        for y in 0..ny {
            for x in 0..nx {
                let mut sum = 0.0_f32;
                let mut count = 0u32;
                let lo = y.saturating_sub(radius);
                let hi = (y + radius).min(ny - 1);
                for yy in lo..=hi {
                    sum += grid[index(x, yy, z)];
                    count += 1;
                }
                tmp[index(x, y, z)] = sum / count as f32;
            }
        }
    }
    grid.copy_from_slice(&tmp);

    // Blur along Z
    for z in 0..nz {
        for y in 0..ny {
            for x in 0..nx {
                let mut sum = 0.0_f32;
                let mut count = 0u32;
                let lo = z.saturating_sub(radius);
                let hi = (z + radius).min(nz - 1);
                for zz in lo..=hi {
                    sum += grid[index(x, y, zz)];
                    count += 1;
                }
                tmp[index(x, y, z)] = sum / count as f32;
            }
        }
    }
    grid.copy_from_slice(&tmp);
}

/// Build a smooth volumetric isosurface mesh using marching cubes over a
/// Gaussian-smoothed 3D scalar field derived from NEXRAD reflectivity scans.
pub fn build_threshold_surface(
    scans: &[ElevationScan],
    threshold_norm: f32,
) -> Option<IsoMeshData> {
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

    let max_elev = scans
        .iter()
        .map(|s| s.elevation_angle)
        .fold(0.0_f32, f32::max);
    let (_, max_height_m, _) = polar_to_world(max_range_m as f64, 0.0, (max_elev + 2.0) as f64);
    let max_height_m = max_height_m.max(8_000.0);

    let nx = 200usize;
    let ny = 80usize;
    let nz = 200usize;
    let half_extent = max_range_m;
    let dx = (2.0 * half_extent) / nx as f32;
    let dy = max_height_m / ny as f32;
    let dz = (2.0 * half_extent) / nz as f32;

    let grid_len = nx * ny * nz;
    let mut scalar_grid = vec![0.0_f32; grid_len];

    let index = |ix: usize, iy: usize, iz: usize| -> usize { ix + iy * nx + iz * nx * ny };

    // ------------------------------------------------------------------
    // Populate scalar field — full iteration, no subsampling.
    // ------------------------------------------------------------------
    let mut max_val = 0.0_f32;
    let mut count_above = 0;

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
                let (x, y, z) = polar_to_world(range_m as f64, az as f64, scan.elevation_angle as f64);

                // Bevy Y is up, but mcubes treats Z as the fastest-changing axis (inner loop).
                // We map Bevy(X, Y, Z) -> Grid(X, Z, Y) so that vertical (Bevy Y) is the slowest axis (Grid Z).
                // This keeps vertical layers contiguous in memory, which is better for the blur pass.
                let fx = (x + half_extent) / dx;
                let fy = (z + half_extent) / dz; // Bevy Z -> Grid Y
                let fz = y / dy;                 // Bevy Y -> Grid Z

                if !(0.0..nx as f32).contains(&fx)
                    || !(0.0..nz as f32).contains(&fy)
                    || !(0.0..ny as f32).contains(&fz)
                {
                    continue;
                }

                let ix = fx.floor() as usize;
                let iy = fy.floor() as usize;
                let iz = fz.floor() as usize;

                // Grid dims are (nx, nz, ny) effectively
                let idx = ix + iy * nx + iz * nx * nz;
                scalar_grid[idx] = scalar_grid[idx].max(v);
                max_val = max_val.max(v);
                if v > threshold_norm {
                    count_above += 1;
                }
            }
        }
    }

    info!("Isosurface grid stats: max_val={:.3}, count_above_threshold={}", max_val, count_above);

    // ------------------------------------------------------------------
    // 3D box blur — 2 passes with radius 2 to smooth sparse tilt layers
    // into a continuous field suitable for marching cubes.
    // ------------------------------------------------------------------
    // Note: dims passed to blur must match indexing logic: (nx, nz, ny)
    box_blur_3d(&mut scalar_grid, nx, nz, ny, 2);
    box_blur_3d(&mut scalar_grid, nx, nz, ny, 2);

    // ------------------------------------------------------------------
    // Marching Cubes
    // ------------------------------------------------------------------
    let mc = MarchingCubes::new(
        (nx, nz, ny), // Grid dims: X, Z, Y (vertical is last)
        (2.0 * half_extent, 2.0 * half_extent, max_height_m), // Physical size
        (nx as f32, nz as f32, ny as f32), // Sampling interval
        LinVec3::new(-half_extent, -half_extent, 0.0), // Offset
        scalar_grid.clone(),
        threshold_norm,
    )
    .ok()?;
    
    let mesh = mc.generate(MeshSide::OutsideOnly);

    info!("Marching cubes generated {} vertices, {} indices", mesh.vertices.len(), mesh.indices.len());

    if mesh.indices.is_empty() {
        return None;
    }

    // ------------------------------------------------------------------
    // Trilinear sampler used for vertex coloring.
    // ------------------------------------------------------------------
    let sample_trilinear = |x: f32, y: f32, z: f32| -> f32 {
        // Map back from physical coords to grid coords
        // Grid setup was: X -> X, Y -> Z, Z -> Y
        // So here: x -> grid X, y -> grid Z, z -> grid Y
        let gx = ((x + half_extent) / dx).clamp(0.0, (nx - 1) as f32);
        let gy = ((z + half_extent) / dz).clamp(0.0, (nz - 1) as f32);
        let gz = (y / dy).clamp(0.0, (ny - 1) as f32);

        let x0 = gx.floor() as usize;
        let y0 = gy.floor() as usize;
        let z0 = gz.floor() as usize;
        let x1 = (x0 + 1).min(nx - 1);
        let y1 = (y0 + 1).min(nz - 1);
        let z1 = (z0 + 1).min(ny - 1);

        let tx = gx - x0 as f32;
        let ty = gy - y0 as f32;
        let tz = gz - z0 as f32;

        let idx = |ix, iy, iz| ix + iy * nx + iz * nx * nz;

        let c000 = scalar_grid[idx(x0, y0, z0)];
        let c100 = scalar_grid[idx(x1, y0, z0)];
        let c010 = scalar_grid[idx(x0, y1, z0)];
        let c110 = scalar_grid[idx(x1, y1, z0)];
        let c001 = scalar_grid[idx(x0, y0, z1)];
        let c101 = scalar_grid[idx(x1, y0, z1)];
        let c011 = scalar_grid[idx(x0, y1, z1)];
        let c111 = scalar_grid[idx(x1, y1, z1)];

        let c00 = c000 * (1.0 - tx) + c100 * tx;
        let c10 = c010 * (1.0 - tx) + c110 * tx;
        let c01 = c001 * (1.0 - tx) + c101 * tx;
        let c11 = c011 * (1.0 - tx) + c111 * tx;
        let c0 = c00 * (1.0 - ty) + c10 * ty;
        let c1 = c01 * (1.0 - ty) + c11 * ty;
        c0 * (1.0 - tz) + c1 * tz
    };

    // ------------------------------------------------------------------
    // Per-vertex coloring: step inward along -normal to sample the peak
    // reflectivity behind the surface, not on it (where value == threshold).
    // ------------------------------------------------------------------
    let inward_step = dx.max(dz) * 1.0; // Reduced from 2.5 to 1.0 to stay within thin features

    let positions: Vec<[f32; 3]> = mesh
        .vertices
        .iter()
        .map(|v| [v.posit.x, v.posit.z, v.posit.y]) // Swap Y/Z back: Grid Y -> Bevy Z, Grid Z -> Bevy Y
        .collect();
    let normals: Vec<[f32; 3]> = mesh
        .vertices
        .iter()
        .map(|v| [v.normal.x, v.normal.z, v.normal.y]) // Swap Y/Z back
        .collect();
    let colors: Vec<[f32; 4]> = mesh
        .vertices
        .iter()
        .map(|v| {
            // v.posit is in Grid coords (X, Z, Y), so we need to map to Bevy (X, Y, Z)
            let bx = v.posit.x;
            let by = v.posit.z; // Grid Z is Bevy Y (up)
            let bz = v.posit.y; // Grid Y is Bevy Z (north/south)

            let bnx = v.normal.x;
            let bny = v.normal.z;
            let bnz = v.normal.y;
            
            let len = (bnx * bnx + bny * bny + bnz * bnz).sqrt().max(1e-6);

            // Step inward (opposite normal direction) to find higher-intensity data.
            let ix = bx - (bnx / len) * inward_step;
            let iy = by - (bny / len) * inward_step;
            let iz = bz - (bnz / len) * inward_step;

            let val = sample_trilinear(ix, iy, iz);
            nws_colormap(val)
        })
        .collect();
    let indices: Vec<u32> = mesh.indices.iter().map(|&i| i as u32).collect();

    Some(IsoMeshData {
        positions,
        normals,
        colors,
        indices,
    })
}
