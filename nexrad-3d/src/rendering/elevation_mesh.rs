use bevy::{
    asset::RenderAssetUsages,
    mesh::{Indices, PrimitiveTopology},
    prelude::*,
};

use crate::nexrad::{beam_height::polar_to_world, types::ElevationScan};

/// Build a 3D triangle mesh for one elevation scan.
///
/// Geometry: a (num_rays+1) × (num_gates+1) vertex grid where each vertex is
/// positioned at the correct 3D world-space location using the 4/3 Earth model.
///
/// UV layout: u = gate_index / num_gates, v = ray_index / num_rays.
/// The R8Unorm reflectivity texture is sampled at these UVs in the fragment shader.
pub fn build_elevation_mesh(scan: &ElevationScan) -> Mesh {
    let num_rays = scan.num_rays;
    let num_gates = scan.num_gates;

    let vert_count = (num_rays + 1) * (num_gates + 1);
    let tri_count = num_rays * num_gates * 2;

    let mut positions: Vec<[f32; 3]> = Vec::with_capacity(vert_count);
    let mut normals: Vec<[f32; 3]> = Vec::with_capacity(vert_count);
    let mut uvs: Vec<[f32; 2]> = Vec::with_capacity(vert_count);
    let mut indices: Vec<u32> = Vec::with_capacity(tri_count * 3);

    for ray_i in 0..=num_rays {
        // Wrap around: last row reuses azimuth of ray 0 + 360° to close the disk.
        let az = if ray_i < num_rays {
            scan.azimuths[ray_i]
        } else {
            scan.azimuths[0] + 360.0
        };

        for gate_i in 0..=num_gates {
            let range_m = (scan.first_gate_m + gate_i as f32 * scan.gate_size_m) as f64;
            let (x, y, z) = polar_to_world(range_m, az as f64, scan.elevation_angle as f64);

            positions.push([x, y, z]);
            normals.push([0.0, 1.0, 0.0]); // flat normal pointing up (unused by shader)

            let u = gate_i as f32 / num_gates as f32;
            let v = ray_i as f32 / num_rays as f32;
            uvs.push([u, v]);
        }
    }

    // Two triangles per quad cell (counter-clockwise winding).
    let cols = (num_gates + 1) as u32;
    for ray_i in 0..num_rays as u32 {
        for gate_i in 0..num_gates as u32 {
            let tl = ray_i * cols + gate_i;
            let tr = tl + 1;
            let bl = tl + cols;
            let br = bl + 1;
            indices.extend_from_slice(&[tl, bl, tr, tr, bl, br]);
        }
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
