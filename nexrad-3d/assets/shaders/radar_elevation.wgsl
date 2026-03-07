#import bevy_pbr::forward_io::VertexOutput

// In Bevy 0.18 the material bind group is group 3 (MATERIAL_BIND_GROUP_INDEX = 3).
@group(3) @binding(0) var reflectivity_texture: texture_2d<f32>;
@group(3) @binding(1) var reflectivity_sampler: sampler;

// Official NWS Standard Reflectivity Color Table.
// Input: normalized reflectivity in [0, 1] (where 1.0 = 75 dBZ).
fn nws_colormap(dbz: f32) -> vec3<f32> {
    if dbz < 5.0 {
        return vec3<f32>(0.0, 0.925, 0.925);    // #00ECEC  5 dBZ
    } else if dbz < 10.0 {
        return vec3<f32>(0.0, 0.925, 0.925);    // #00ECEC  5-10
    } else if dbz < 15.0 {
        return vec3<f32>(0.004, 0.627, 0.965);  // #01A0F6  10-15
    } else if dbz < 20.0 {
        return vec3<f32>(0.0, 0.0, 0.965);      // #0000F6  15-20
    } else if dbz < 25.0 {
        return vec3<f32>(0.0, 1.0, 0.0);        // #00FF00  20-25
    } else if dbz < 30.0 {
        return vec3<f32>(0.0, 0.784, 0.0);      // #00C800  25-30
    } else if dbz < 35.0 {
        return vec3<f32>(0.0, 0.565, 0.0);      // #009000  30-35
    } else if dbz < 40.0 {
        return vec3<f32>(0.973, 0.973, 0.0);    // #F8F800  35-40
    } else if dbz < 45.0 {
        return vec3<f32>(0.906, 0.753, 0.0);    // #E7C000  40-45
    } else if dbz < 50.0 {
        return vec3<f32>(1.0, 0.565, 0.0);      // #FF9000  45-50
    } else if dbz < 55.0 {
        return vec3<f32>(1.0, 0.0, 0.0);        // #FF0000  50-55
    } else if dbz < 60.0 {
        return vec3<f32>(0.839, 0.0, 0.0);      // #D60000  55-60
    } else if dbz < 65.0 {
        return vec3<f32>(0.753, 0.0, 0.0);      // #C00000  60-65
    } else if dbz < 70.0 {
        return vec3<f32>(1.0, 0.0, 1.0);        // #FF00FF  65-70
    } else {
        return vec3<f32>(0.6, 0.333, 0.788);    // #9955C9  70+
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
