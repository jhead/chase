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
    ///   x = threshold_dbz (reflectivity only — pixels below this are discarded)
    ///   y = range_km      (render radius cap; 0 = no cap)
    ///   z = site_world_x
    ///   w = site_world_z
    #[uniform(2)]
    pub params: Vec4,
    /// Moment selection:
    ///   x = moment index (0=REF 1=VEL 2=SW 3=ZDR 4=CC 5=PHIDP)
    #[uniform(3)]
    pub moment_params: Vec4,
}

impl Material for RadarMaterial {
    fn fragment_shader() -> ShaderRef {
        "embedded://layer_radar_l2/shaders/radar_elevation.wgsl".into()
    }

    fn alpha_mode(&self) -> AlphaMode {
        AlphaMode::Blend
    }
}
