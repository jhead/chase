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
}

impl Material for RadarMaterial {
    fn fragment_shader() -> ShaderRef {
        "shaders/radar_elevation.wgsl".into()
    }

    fn alpha_mode(&self) -> AlphaMode {
        AlphaMode::Blend
    }
}

/// Custom material for the derived isosurface mesh.
/// Uses vertex colors (NWS reflectivity ramp) with per-fragment directional shading.
/// Double-sided rendering is handled in the WGSL shader (no cull_mode override needed
/// because the MC mesh has consistent outward-facing winding from MeshSide::OutsideOnly).
#[derive(Asset, TypePath, AsBindGroup, Debug, Clone)]
pub struct IsoSurfaceMaterial {}

impl Material for IsoSurfaceMaterial {
    fn fragment_shader() -> ShaderRef {
        "shaders/isosurface.wgsl".into()
    }

    fn alpha_mode(&self) -> AlphaMode {
        AlphaMode::Opaque
    }
}
