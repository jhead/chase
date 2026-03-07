#import bevy_pbr::forward_io::VertexOutput

// In Bevy 0.18 the material bind group is group 3 (MATERIAL_BIND_GROUP_INDEX = 3).
@group(3) @binding(0) var reflectivity_texture: texture_2d<f32>;
@group(3) @binding(1) var reflectivity_sampler: sampler;

// NWS Standard Reflectivity Color Table (approximate)
// Input: normalized reflectivity in [0, 1] (where 1.0 ≈ 75 dBZ).
fn nws_colormap(v: f32) -> vec3<f32> {
    if v <= 0.06 { // < 5 dBZ
        return vec3<f32>(0.0, 0.0, 0.0);
    }

    let dbz = v * 75.0;

    if dbz < 10.0 {
        return vec3<f32>(0.0, 1.0, 1.0); // Cyan
    } else if dbz < 15.0 {
        return vec3<f32>(0.0, 0.0, 0.7); // Blue
    } else if dbz < 20.0 {
        return vec3<f32>(0.0, 0.0, 0.5); // Dark Blue
    } else if dbz < 25.0 {
        return vec3<f32>(0.0, 1.0, 0.0); // Green
    } else if dbz < 30.0 {
        return vec3<f32>(0.0, 0.8, 0.0); // Medium Green
    } else if dbz < 35.0 {
        return vec3<f32>(0.0, 0.6, 0.0); // Dark Green
    } else if dbz < 40.0 {
        return vec3<f32>(1.0, 1.0, 0.0); // Yellow
    } else if dbz < 45.0 {
        return vec3<f32>(1.0, 0.8, 0.0); // Dark Yellow
    } else if dbz < 50.0 {
        return vec3<f32>(1.0, 0.6, 0.0); // Orange
    } else if dbz < 55.0 {
        return vec3<f32>(1.0, 0.0, 0.0); // Red
    } else if dbz < 60.0 {
        return vec3<f32>(0.8, 0.0, 0.0); // Medium Red
    } else if dbz < 65.0 {
        return vec3<f32>(0.6, 0.0, 0.0); // Dark Red
    } else if dbz < 70.0 {
        return vec3<f32>(1.0, 0.0, 1.0); // Magenta
    } else {
        return vec3<f32>(0.5, 0.0, 0.5); // Purple
    }
}

@fragment
fn fragment(in: VertexOutput) -> @location(0) vec4<f32> {
    let raw_value = textureSample(reflectivity_texture, reflectivity_sampler, in.uv).r;

    // Discard no-data pixels (transparent gaps between scans)
    if raw_value <= 0.005 {
        discard;
    }

    let color = nws_colormap(raw_value);
    return vec4<f32>(color, 1.0);
}
