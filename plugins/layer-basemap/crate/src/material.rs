use bevy::{
    mesh::{MeshVertexBufferLayoutRef, PrimitiveTopology},
    pbr::{MaterialPipeline, MaterialPipelineKey},
    prelude::*,
    render::render_resource::{AsBindGroup, RenderPipelineDescriptor, SpecializedMeshPipelineError},
    shader::ShaderRef,
};

/// Flat-color unlit material for basemap boundary lines.
/// Color is stored as a vertex attribute (no uniform binding needed).
#[derive(Asset, TypePath, AsBindGroup, Debug, Clone)]
pub struct BasemapLineMaterial {}

impl Material for BasemapLineMaterial {
    fn vertex_shader() -> ShaderRef {
        "embedded://layer_basemap/shaders/basemap_line.wgsl".into()
    }

    fn fragment_shader() -> ShaderRef {
        "embedded://layer_basemap/shaders/basemap_line.wgsl".into()
    }

    fn alpha_mode(&self) -> AlphaMode {
        AlphaMode::Opaque
    }

    fn specialize(
        _pipeline: &MaterialPipeline,
        descriptor: &mut RenderPipelineDescriptor,
        layout: &MeshVertexBufferLayoutRef,
        _key: MaterialPipelineKey<Self>,
    ) -> Result<(), SpecializedMeshPipelineError> {
        // Build a vertex layout with only position (loc 0) and color (loc 1).
        let vertex_layout = layout.0.get_layout(&[
            Mesh::ATTRIBUTE_POSITION.at_shader_location(0),
            Mesh::ATTRIBUTE_COLOR.at_shader_location(1),
        ])?;
        descriptor.vertex.buffers = vec![vertex_layout];
        descriptor.primitive.topology = PrimitiveTopology::LineList;
        Ok(())
    }
}
