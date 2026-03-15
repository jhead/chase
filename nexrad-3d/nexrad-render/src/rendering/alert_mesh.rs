//! Build a flat polygon mesh from 3D vertices (e.g. alert polygon in world space).
//! Uses earcutr for triangulation. Vertices should lie in a plane (constant Y).

use bevy::{
    asset::RenderAssetUsages,
    mesh::{Indices, PrimitiveTopology},
    prelude::*,
};

/// Build a triangle-list mesh from a single polygon ring.
/// `vertices` are in Bevy world space (X East, Y Up, Z South); they should form
/// a closed ring in the XZ plane (Y constant). Uses earcutr for triangulation.
/// Mesh is built with MAIN_WORLD | RENDER_WORLD for CPU-side picking.
pub fn build_alert_mesh(vertices: &[[f32; 3]]) -> Mesh {
    if vertices.len() < 3 {
        return Mesh::new(
            PrimitiveTopology::TriangleList,
            RenderAssetUsages::default(),
        );
    }

    // earcutr expects flat [x0, y0, x1, y0, ...] with dimensions=2. We use X and Z.
    let flat: Vec<f64> = vertices
        .iter()
        .flat_map(|v| [v[0] as f64, v[2] as f64])
        .collect();

    let indices = match earcutr::earcut(&flat, &[], 2) {
        Ok(inds) => inds,
        Err(_) => {
            return Mesh::new(
                PrimitiveTopology::TriangleList,
                RenderAssetUsages::default(),
            );
        }
    };

    let positions: Vec<[f32; 3]> = vertices.to_vec();
    let normals: Vec<[f32; 3]> = (0..positions.len())
        .map(|_| [0.0, 1.0, 0.0])
        .collect();

    // GeoJSON exterior rings are CCW "from above the globe"; in our XZ (Z = -North) that
    // becomes CW from +Y, so the front face would be -Y and get backface-culled. Reverse
    // winding so the polygon faces +Y and is visible from the top-down camera.
    let indices_u32: Vec<u32> = indices
        .chunks_exact(3)
        .flat_map(|tri| [tri[0] as u32, tri[2] as u32, tri[1] as u32])
        .collect();

    let mut mesh = Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::MAIN_WORLD | RenderAssetUsages::RENDER_WORLD,
    );
    mesh.insert_attribute(Mesh::ATTRIBUTE_POSITION, positions);
    mesh.insert_attribute(Mesh::ATTRIBUTE_NORMAL, normals);
    mesh.insert_indices(Indices::U32(indices_u32));
    mesh
}
