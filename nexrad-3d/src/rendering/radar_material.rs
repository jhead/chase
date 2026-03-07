use bevy::{
    prelude::*,
    render::render_resource::AsBindGroup,
    shader::ShaderRef,
};

/// Custom material for rendering one radar elevation scan.
///
/// Bindings (group 2):
/// - 0: R8Unorm reflectivity texture (width=num_gates, height=num_rays)
/// - 1: Nearest-filter sampler
#[derive(Asset, TypePath, AsBindGroup, Debug, Clone)]
pub struct RadarMaterial {
    #[texture(0)]
    #[sampler(1)]
    pub reflectivity_texture: Handle<Image>,
}

impl Material for RadarMaterial {
    fn fragment_shader() -> ShaderRef {
        "shaders/radar_elevation.wgsl".into()
    }

    fn alpha_mode(&self) -> AlphaMode {
        AlphaMode::Blend
    }
}
