#import bevy_pbr::forward_io::VertexOutput

// In Bevy 0.18 the material bind group is group 3 (MATERIAL_BIND_GROUP_INDEX = 3).
@group(3) @binding(0) var reflectivity_texture: texture_2d<f32>;
@group(3) @binding(1) var reflectivity_sampler: sampler;

// NWS reflectivity colormap — ported verbatim from fragment.glsl.
// Input: normalized reflectivity in [0, 1] (where 1.0 ≈ 75 dBZ).
fn nws_colormap(v: f32) -> vec3<f32> {
    if v <= 0.0 {
        return vec3<f32>(0.0, 0.0, 0.0);
    }

    var range_start: f32;
    var range_end: f32;
    var color_start: vec3<f32>;
    var color_end: vec3<f32>;

    if v < 0.2 {
        range_start = 0.0;
        range_end   = 0.2;
        color_start = vec3<f32>(0.0,  0.0,  0.0);
        color_end   = vec3<f32>(0.2,  0.48, 0.55);
    } else if v < 0.4 {
        range_start = 0.2;
        range_end   = 0.4;
        color_start = vec3<f32>(0.07, 0.25, 0.04);
        color_end   = vec3<f32>(0.15, 0.63, 0.2);
    } else if v < 0.66 {
        range_start = 0.4;
        range_end   = 0.66;
        color_start = vec3<f32>(1.0,  1.0,  0.0);
        color_end   = vec3<f32>(1.0,  0.5,  0.0);
    } else if v < 0.8 {
        range_start = 0.66;
        range_end   = 0.8;
        color_start = vec3<f32>(1.0,  0.0,  0.0);
        color_end   = vec3<f32>(0.37, 0.08, 0.08);
    } else {
        range_start = 0.8;
        range_end   = 1.0;
        color_start = vec3<f32>(0.68, 0.43, 0.58);
        color_end   = vec3<f32>(0.6,  0.0,  0.30);
    }

    return mix(color_start, color_end, smoothstep(range_start, range_end, v));
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
