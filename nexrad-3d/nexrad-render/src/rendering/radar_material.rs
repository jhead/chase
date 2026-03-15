use bevy::{
    prelude::*,
    render::render_resource::AsBindGroup,
    shader::ShaderRef,
};

/// Custom material for rendering one radar elevation scan.
#[derive(Asset, TypePath, AsBindGroup, Debug, Clone)]
pub struct RadarMaterial {
    #[texture(0)]
    #[sampler(1)]
    pub reflectivity_texture: Handle<Image>,
    /// Shader parameters packed into a vec4:
    ///   x = threshold_dbz — pixels below this dBZ value are discarded.
    #[uniform(2)]
    pub params: Vec4,
}

impl Material for RadarMaterial {
    fn fragment_shader() -> ShaderRef {
        "embedded://nexrad_render/rendering/shaders/radar_elevation.wgsl".into()
    }

    fn alpha_mode(&self) -> AlphaMode {
        AlphaMode::Blend
    }
}

