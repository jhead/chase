//! Alert polygon triangulation via ear-cutting.

use bevy::{
    asset::RenderAssetUsages,
    mesh::{Indices, PrimitiveTopology},
    prelude::*,
};

/// Build a flat triangulated mesh from a ring of 3-D vertices (Y is up).
///
/// The triangulation is performed on the XZ plane using `earcutr`.  Winding
/// order is flipped so the polygon faces upward (+Y).
pub fn build_alert_mesh(vertices: &[[f32; 3]]) -> Mesh {
    if vertices.len() < 3 {
        return Mesh::new(PrimitiveTopology::TriangleList, RenderAssetUsages::default());
    }

    let flat: Vec<f64> = vertices
        .iter()
        .flat_map(|v| [v[0] as f64, v[2] as f64])
        .collect();

    let indices = match earcutr::earcut(&flat, &[], 2) {
        Ok(inds) => inds,
        Err(_) => {
            return Mesh::new(PrimitiveTopology::TriangleList, RenderAssetUsages::default());
        }
    };

    let positions: Vec<[f32; 3]> = vertices.to_vec();
    let normals: Vec<[f32; 3]> = (0..positions.len()).map(|_| [0.0, 1.0, 0.0]).collect();

    // Flip winding order so the face points upward.
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
