use bevy::{
    prelude::*,
    render::render_resource::AsBindGroup,
    shader::ShaderRef,
};

#[derive(Asset, TypePath, AsBindGroup, Clone, Debug)]
pub struct AlertMaterial {
    #[uniform(0)]
    pub color: Vec4,
}

impl Material for AlertMaterial {
    fn fragment_shader() -> ShaderRef {
        "embedded://layer_noaa_alerts/shaders/alert.wgsl".into()
    }
    fn alpha_mode(&self) -> AlphaMode {
        AlphaMode::Blend
    }
}
