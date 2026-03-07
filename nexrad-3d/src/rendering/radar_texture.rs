use bevy::{
    asset::RenderAssetUsages,
    image::{ImageFilterMode, ImageSampler, ImageSamplerDescriptor},
    prelude::*,
    render::render_resource::{Extent3d, TextureDimension, TextureFormat},
};

use crate::nexrad::types::ElevationScan;

/// Create an R8Unorm texture from an elevation scan's reflectivity data.
///
/// Dimensions: width = num_gates, height = num_rays.
/// Values are quantized from [0.0, 1.0] to [0, 255].
pub fn create_reflectivity_texture(
    images: &mut Assets<Image>,
    scan: &ElevationScan,
) -> Handle<Image> {
    let data: Vec<u8> = scan
        .reflectivity
        .iter()
        .map(|&v| (v.clamp(0.0, 1.0) * 255.0) as u8)
        .collect();

    let mut image = Image::new(
        Extent3d {
            width: scan.num_gates as u32,
            height: scan.num_rays as u32,
            depth_or_array_layers: 1,
        },
        TextureDimension::D2,
        data,
        TextureFormat::R8Unorm,
        RenderAssetUsages::RENDER_WORLD,
    );

    image.sampler = ImageSampler::Descriptor(ImageSamplerDescriptor {
        mag_filter: ImageFilterMode::Nearest,
        min_filter: ImageFilterMode::Nearest,
        ..default()
    });

    images.add(image)
}
