#import bevy_pbr::forward_io::VertexOutput

// In Bevy 0.18 the material bind group is group 3 (MATERIAL_BIND_GROUP_INDEX = 3).
@group(3) @binding(0) var reflectivity_texture: texture_2d<f32>;
@group(3) @binding(1) var reflectivity_sampler: sampler;

// Reflectivity color table approximating the shared NWS LUT.
// Input: dBZ in physical units (0–75 dBZ in practice; colors follow the 0–95 LUT).
fn nws_colormap(dbz: f32) -> vec3<f32> {
    if dbz < 5.0 {
        return vec3<f32>(0.318, 0.447, 0.537); // ~#517289 (19 dBZ blue, low end)
    } else if dbz < 10.0 {
        return vec3<f32>(0.188, 0.212, 0.251); // #303640
    } else if dbz < 15.0 {
        return vec3<f32>(0.220, 0.283, 0.388); // #384863
    } else if dbz < 20.0 {
        return vec3<f32>(0.318, 0.447, 0.537); // #597f96
    } else if dbz < 25.0 {
        return vec3<f32>(0.314, 0.671, 0.451); // ~#5eab73
    } else if dbz < 30.0 {
        return vec3<f32>(0.196, 0.631, 0.294); // ~#50a14b
    } else if dbz < 35.0 {
        return vec3<f32>(0.412, 0.627, 0.110); // ~#2c621c / #4e8025 blend
    } else if dbz < 40.0 {
        return vec3<f32>(0.988, 0.992, 0.329); // #fcfd54
    } else if dbz < 45.0 {
        return vec3<f32>(0.820, 0.776, 0.231); // ~#d1c640
    } else if dbz < 50.0 {
        return vec3<f32>(0.855, 0.584, 0.208); // ~#e89535
    } else if dbz < 55.0 {
        return vec3<f32>(0.694, 0.404, 0.145); // ~#b16727
    } else if dbz < 60.0 {
        return vec3<f32>(0.776, 0.216, 0.153); // #c23724
    } else if dbz < 65.0 {
        return vec3<f32>(0.533, 0.188, 0.137); // ~#883023
    } else if dbz < 70.0 {
        return vec3<f32>(0.733, 0.435, 0.600); // #bb6f99
    } else if dbz < 75.0 {
        return vec3<f32>(0.698, 0.220, 0.463); // #b23876
    } else if dbz < 80.0 {
        return vec3<f32>(0.416, 0.133, 0.710); // #6a22b5
    } else if dbz < 85.0 {
        return vec3<f32>(0.235, 0.078, 0.541); // #3c148a
    } else if dbz < 90.0 {
        return vec3<f32>(0.502, 0.761, 0.804); // #80c2cd
    } else if dbz < 95.0 {
        return vec3<f32>(0.314, 0.459, 0.549); // #50758c
    } else {
        return vec3<f32>(0.412, 0.090, 0.043); // #69170b
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
