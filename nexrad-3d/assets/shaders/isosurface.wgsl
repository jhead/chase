#import bevy_pbr::forward_io::VertexOutput

@fragment
fn fragment(in: VertexOutput) -> @location(0) vec4<f32> {
    // Vertex colors carry the NWS reflectivity colormap, set during mesh generation.
    // Apply a simple directional shading factor from the normal to give 3D depth.
    let light_dir = normalize(vec3<f32>(0.4, 0.8, 0.3));
    let ndotl = max(dot(normalize(in.world_normal), light_dir), 0.0);
    let shading = 0.35 + 0.65 * ndotl;

    let color = in.color * shading;
    return vec4<f32>(color.rgb, in.color.a);
}
