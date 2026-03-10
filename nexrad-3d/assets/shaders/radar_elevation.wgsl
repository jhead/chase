#import bevy_pbr::forward_io::VertexOutput

// In Bevy 0.18 the material bind group is group 3 (MATERIAL_BIND_GROUP_INDEX = 3).
@group(3) @binding(0) var reflectivity_texture: texture_2d<f32>;
@group(3) @binding(1) var reflectivity_sampler: sampler;

// Official NWS Standard Reflectivity Color Table.
// Input: normalized reflectivity in [0, 1] (where 1.0 = 75 dBZ).
fn nws_colormap(dbz: f32) -> vec3<f32> {
    if dbz < 5.0 {
        return vec3<f32>(0.188, 0.204, 0.227);
    } else if dbz < 10.0 {
        return vec3<f32>(0.188, 0.235, 0.337);
    } else if dbz < 15.0 {
        return vec3<f32>(0.302, 0.424, 0.518);
    } else if dbz < 20.0 {
        return vec3<f32>(0.369, 0.671, 0.451);
    } else if dbz < 25.0 {
        return vec3<f32>(0.227, 0.482, 0.180);
    } else if dbz < 30.0 {
        return vec3<f32>(0.635, 0.745, 0.231);
    } else if dbz < 35.0 {
        return vec3<f32>(0.898, 0.875, 0.286);
    } else if dbz < 40.0 {
        return vec3<f32>(0.925, 0.600, 0.216);
    } else if dbz < 45.0 {
        return vec3<f32>(0.780, 0.475, 0.173);
    } else if dbz < 50.0 {
        return vec3<f32>(0.898, 0.243, 0.153);
    } else if dbz < 55.0 {
        return vec3<f32>(0.690, 0.208, 0.137);
    } else if dbz < 60.0 {
        return vec3<f32>(0.471, 0.184, 0.145);
    } else if dbz < 65.0 {
        return vec3<f32>(0.725, 0.388, 0.573);
    } else if dbz < 70.0 {
        return vec3<f32>(0.698, 0.188, 0.439);
    } else if dbz < 75.0 {
        return vec3<f32>(0.396, 0.129, 0.694);
    } else if dbz < 80.0 {
        return vec3<f32>(0.224, 0.071, 0.525);
    } else if dbz < 85.0 {
        return vec3<f32>(0.482, 0.733, 0.780);
    } else if dbz < 90.0 {
        return vec3<f32>(0.314, 0.459, 0.549);
    } else {
        return vec3<f32>(0.412, 0.090, 0.043);
    }
}

@fragment
fn fragment(in: VertexOutput) -> @location(0) vec4<f32> {
    let raw_value = textureSample(reflectivity_texture, reflectivity_sampler, in.uv).r;
    let dbz = raw_value * 75.0;

    // Discard pixels below 10 dBZ — removes ground clutter and noise speckle.
    if dbz < 10.0 {
        discard;
    }

    let color = nws_colormap(dbz);
    return vec4<f32>(color, 1.0);
}
