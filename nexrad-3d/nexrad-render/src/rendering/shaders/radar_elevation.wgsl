#import bevy_pbr::forward_io::VertexOutput

@group(3) @binding(0) var reflectivity_texture: texture_2d<f32>;
@group(3) @binding(1) var reflectivity_sampler: sampler;

fn nws_colormap(dbz: f32) -> vec3<f32> {
    if dbz < 5.0 {
        return vec3<f32>(0.0, 0.925, 0.925);
    } else if dbz < 10.0 {
        return vec3<f32>(0.0, 0.925, 0.925);
    } else if dbz < 15.0 {
        return vec3<f32>(0.004, 0.627, 0.965);
    } else if dbz < 20.0 {
        return vec3<f32>(0.0, 0.0, 0.965);
    } else if dbz < 25.0 {
        return vec3<f32>(0.0, 1.0, 0.0);
    } else if dbz < 30.0 {
        return vec3<f32>(0.0, 0.784, 0.0);
    } else if dbz < 35.0 {
        return vec3<f32>(0.0, 0.565, 0.0);
    } else if dbz < 40.0 {
        return vec3<f32>(0.973, 0.973, 0.0);
    } else if dbz < 45.0 {
        return vec3<f32>(0.906, 0.753, 0.0);
    } else if dbz < 50.0 {
        return vec3<f32>(1.0, 0.565, 0.0);
    } else if dbz < 55.0 {
        return vec3<f32>(1.0, 0.0, 0.0);
    } else if dbz < 60.0 {
        return vec3<f32>(0.839, 0.0, 0.0);
    } else if dbz < 65.0 {
        return vec3<f32>(0.753, 0.0, 0.0);
    } else if dbz < 70.0 {
        return vec3<f32>(1.0, 0.0, 1.0);
    } else {
        return vec3<f32>(0.6, 0.333, 0.788);
    }
}

@fragment
fn fragment(in: VertexOutput) -> @location(0) vec4<f32> {
    let raw = textureSample(reflectivity_texture, reflectivity_sampler, in.uv).r;
    let dbz = raw * 75.0;

    if dbz < 10.0 {
        discard;
    }

    let color = nws_colormap(dbz);
    return vec4<f32>(color, 1.0);
}
