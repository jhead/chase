use bevy::{
    asset::RenderAssetUsages,
    mesh::PrimitiveTopology,
    prelude::*,
};

use super::data::BasemapLayer;

/// Build a Bevy `LineList` mesh from a pre-projected basemap layer.
/// Vertex color is stored as `Mesh::ATTRIBUTE_COLOR` (RGBA, one per vertex).
/// Returns `None` if the layer has no vertices.
pub fn build_line_mesh(layer: &BasemapLayer, color: Vec4) -> Option<Mesh> {
    if layer.vertices.is_empty() {
        return None;
    }

    let count = layer.vertices.len();
    let positions: Vec<[f32; 3]> = layer.vertices.clone();
    let colors: Vec<[f32; 4]> = vec![color.to_array(); count];

    let mut mesh = Mesh::new(PrimitiveTopology::LineList, RenderAssetUsages::RENDER_WORLD);
    mesh.insert_attribute(Mesh::ATTRIBUTE_POSITION, positions);
    mesh.insert_attribute(Mesh::ATTRIBUTE_COLOR, colors);
    Some(mesh)
}
