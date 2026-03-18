use bevy::{
    asset::RenderAssetUsages,
    mesh::{Indices, PrimitiveTopology},
    prelude::*,
};

use radish_core::{beam_height::polar_to_world, types::ElevationScan};

/// Build a 3D slab mesh for one elevation scan.
///
/// Each scan "owns" the vertical space from `lower_elev` to `upper_elev`
/// (both in degrees above horizon). Typically these are the midpoints between
/// this scan and its neighbours, so adjacent slabs share exactly the same
/// boundary height and the full volume is seamlessly contiguous.
pub fn build_elevation_mesh(
    scan: &ElevationScan,
    lower_elev: f32,
    upper_elev: f32,
) -> Mesh {
    let num_rays = scan.num_rays;
    let num_gates = scan.num_gates;

    let layer_verts = (num_rays + 1) * (num_gates + 1);
    let vert_count = 2 * layer_verts;

    let idx_count = (2 * num_rays * num_gates * 2 + num_rays * 2) * 3;

    let mut positions: Vec<[f32; 3]> = Vec::with_capacity(vert_count);
    let mut normals: Vec<[f32; 3]> = Vec::with_capacity(vert_count);
    let mut uvs: Vec<[f32; 2]> = Vec::with_capacity(vert_count);
    let mut indices: Vec<u32> = Vec::with_capacity(idx_count);

    let az_for = |ray_i: usize| -> f32 {
        if ray_i < num_rays {
            scan.azimuths[ray_i]
        } else {
            scan.azimuths[0] + 360.0
        }
    };

    // Layer 0: bottom vertices at lower_elev
    for ray_i in 0..=num_rays {
        let az = az_for(ray_i);
        for gate_i in 0..=num_gates {
            let range_m = (scan.first_gate_m + gate_i as f32 * scan.gate_size_m) as f64;
            let (x, y, z) = polar_to_world(range_m, az as f64, lower_elev as f64);
            positions.push([x, y, z]);
            normals.push([0.0, -1.0, 0.0]);
            uvs.push([
                gate_i as f32 / num_gates as f32,
                ray_i as f32 / num_rays as f32,
            ]);
        }
    }

    // Layer 1: top vertices at upper_elev
    for ray_i in 0..=num_rays {
        let az = az_for(ray_i);
        for gate_i in 0..=num_gates {
            let range_m = (scan.first_gate_m + gate_i as f32 * scan.gate_size_m) as f64;
            let (x, y, z) = polar_to_world(range_m, az as f64, upper_elev as f64);
            positions.push([x, y, z]);
            normals.push([0.0, 1.0, 0.0]);
            uvs.push([
                gate_i as f32 / num_gates as f32,
                ray_i as f32 / num_rays as f32,
            ]);
        }
    }

    let cols = (num_gates + 1) as u32;
    let layer = layer_verts as u32;

    // Top surface (Layer 1) — CCW winding, faces upward
    for ray_i in 0..num_rays as u32 {
        for gate_i in 0..num_gates as u32 {
            let tl = layer + ray_i * cols + gate_i;
            let tr = tl + 1;
            let bl = tl + cols;
            let br = bl + 1;
            indices.extend_from_slice(&[tl, bl, tr, tr, bl, br]);
        }
    }

    // Bottom surface (Layer 0) — reversed winding, faces downward
    for ray_i in 0..num_rays as u32 {
        for gate_i in 0..num_gates as u32 {
            let tl = ray_i * cols + gate_i;
            let tr = tl + 1;
            let bl = tl + cols;
            let br = bl + 1;
            indices.extend_from_slice(&[tl, tr, bl, tr, br, bl]);
        }
    }

    // Outer wall — ring at gate = num_gates connecting the two layers
    let outer = num_gates as u32;
    for ray_i in 0..num_rays as u32 {
        let b0 = ray_i * cols + outer;
        let b1 = (ray_i + 1) * cols + outer;
        let t0 = layer + b0;
        let t1 = layer + b1;
        indices.extend_from_slice(&[b0, t0, b1, t0, t1, b1]);
    }

    let mut mesh = Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::RENDER_WORLD,
    );
    mesh.insert_attribute(Mesh::ATTRIBUTE_POSITION, positions);
    mesh.insert_attribute(Mesh::ATTRIBUTE_NORMAL, normals);
    mesh.insert_attribute(Mesh::ATTRIBUTE_UV_0, uvs);
    mesh.insert_indices(Indices::U32(indices));
    mesh
}
