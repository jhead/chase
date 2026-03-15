// Unlit ring+dot marker for radar sites. Uses world position and center uniform.
#import bevy_pbr::forward_io::VertexOutput

// params_a: (center.x, center.y, center.z, radius)
// params_b: (color.r, color.g, color.b, color.a)
@group(3) @binding(0) var<uniform> params_a: vec4<f32>;
@group(3) @binding(1) var<uniform> params_b: vec4<f32>;

@fragment
fn fragment(in: VertexOutput) -> @location(0) vec4<f32> {
    let world_pos = in.world_position.xyz;
    let center = params_a.xyz;
    let radius = params_a.w;
    let delta_xz = world_pos.xz - center.xz;
    let dist = length(delta_xz) / radius;
    // Inner dot: dist < 0.12; ring: 0.35 < dist < 0.5
    if dist < 0.12 {
        return params_b;
    }
    if dist >= 0.35 && dist <= 0.5 {
        return params_b;
    }
    discard;
}
