#import bevy_pbr::forward_io::VertexOutput

@group(3) @binding(0) var reflectivity_texture: texture_2d<f32>;
@group(3) @binding(1) var reflectivity_sampler: sampler;
/// params.x = threshold_dbz (reflectivity only — pixels below this are discarded)
/// params.y = range_km (cap radius; 0 = no cap)
/// params.z = site_world_x
/// params.w = site_world_z
@group(3) @binding(2) var<uniform> params: vec4<f32>;
/// moment_params.x = moment index (0=REF 1=VEL 2=SW 3=ZDR 4=CC 5=PHIDP)
@group(3) @binding(3) var<uniform> moment_params: vec4<f32>;

// ── Reflectivity colormap (NWS) ───────────────────────────────────────────────

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

// ── Velocity colormap (NWS-style, blue=inbound, red=outbound) ────────────────

fn velocity_colormap(vel: f32) -> vec3<f32> {
    if vel < -60.0 {
        return vec3<f32>(0.02, 0.02, 0.50);
    } else if vel < -45.0 {
        return vec3<f32>(0.00, 0.08, 0.82);
    } else if vel < -30.0 {
        return vec3<f32>(0.00, 0.44, 0.94);
    } else if vel < -20.0 {
        return vec3<f32>(0.00, 0.72, 0.86);
    } else if vel < -10.0 {
        return vec3<f32>(0.35, 0.86, 0.86);
    } else if vel < -3.0 {
        return vec3<f32>(0.60, 0.92, 0.75);
    } else if vel < 3.0 {
        // Near-zero: light gray
        return vec3<f32>(0.78, 0.78, 0.78);
    } else if vel < 10.0 {
        return vec3<f32>(0.78, 0.92, 0.55);
    } else if vel < 20.0 {
        return vec3<f32>(0.86, 0.86, 0.18);
    } else if vel < 30.0 {
        return vec3<f32>(0.98, 0.72, 0.00);
    } else if vel < 45.0 {
        return vec3<f32>(0.96, 0.40, 0.05);
    } else if vel < 60.0 {
        return vec3<f32>(0.84, 0.08, 0.08);
    } else {
        return vec3<f32>(0.50, 0.00, 0.00);
    }
}

// ── Spectrum width colormap ───────────────────────────────────────────────────

fn spectrum_width_colormap(sw: f32) -> vec3<f32> {
    if sw < 1.0 {
        return vec3<f32>(0.05, 0.08, 0.22);
    } else if sw < 2.0 {
        return vec3<f32>(0.05, 0.20, 0.55);
    } else if sw < 3.5 {
        return vec3<f32>(0.00, 0.45, 0.75);
    } else if sw < 5.0 {
        return vec3<f32>(0.00, 0.70, 0.55);
    } else if sw < 6.5 {
        return vec3<f32>(0.42, 0.80, 0.18);
    } else if sw < 8.0 {
        return vec3<f32>(0.92, 0.80, 0.00);
    } else if sw < 9.5 {
        return vec3<f32>(1.00, 0.45, 0.00);
    } else {
        return vec3<f32>(0.80, 0.04, 0.04);
    }
}

// ── Differential reflectivity colormap (ZDR) ─────────────────────────────────

fn zdr_colormap(zdr: f32) -> vec3<f32> {
    if zdr < -3.0 {
        return vec3<f32>(0.08, 0.00, 0.45);
    } else if zdr < -2.0 {
        return vec3<f32>(0.00, 0.18, 0.80);
    } else if zdr < -1.0 {
        return vec3<f32>(0.20, 0.55, 0.95);
    } else if zdr < 0.0 {
        return vec3<f32>(0.60, 0.82, 1.00);
    } else if zdr < 0.5 {
        return vec3<f32>(0.85, 0.95, 0.75);
    } else if zdr < 1.5 {
        return vec3<f32>(0.55, 0.85, 0.30);
    } else if zdr < 2.5 {
        return vec3<f32>(0.90, 0.82, 0.00);
    } else if zdr < 3.5 {
        return vec3<f32>(1.00, 0.55, 0.00);
    } else if zdr < 5.0 {
        return vec3<f32>(0.88, 0.12, 0.12);
    } else {
        return vec3<f32>(0.55, 0.00, 0.55);
    }
}

// ── Correlation coefficient colormap (CC / rhoHV) ────────────────────────────

fn cc_colormap(cc: f32) -> vec3<f32> {
    if cc < 0.60 {
        return vec3<f32>(0.45, 0.00, 0.50);
    } else if cc < 0.70 {
        return vec3<f32>(0.70, 0.10, 0.55);
    } else if cc < 0.80 {
        return vec3<f32>(0.18, 0.35, 0.80);
    } else if cc < 0.85 {
        return vec3<f32>(0.00, 0.65, 0.80);
    } else if cc < 0.90 {
        return vec3<f32>(0.00, 0.78, 0.40);
    } else if cc < 0.93 {
        return vec3<f32>(0.38, 0.80, 0.10);
    } else if cc < 0.96 {
        return vec3<f32>(0.92, 0.86, 0.00);
    } else if cc < 0.98 {
        return vec3<f32>(1.00, 0.58, 0.00);
    } else {
        return vec3<f32>(0.92, 0.18, 0.08);
    }
}

// ── Differential phase colormap (PhiDP) ──────────────────────────────────────

fn phidp_colormap(phi: f32) -> vec3<f32> {
    if phi < -90.0 {
        return vec3<f32>(0.42, 0.00, 0.70);
    } else if phi < 0.0 {
        return vec3<f32>(0.08, 0.28, 0.88);
    } else if phi < 90.0 {
        return vec3<f32>(0.00, 0.75, 0.55);
    } else if phi < 180.0 {
        return vec3<f32>(0.88, 0.82, 0.00);
    } else if phi < 270.0 {
        return vec3<f32>(0.92, 0.42, 0.00);
    } else {
        return vec3<f32>(0.70, 0.00, 0.38);
    }
}

// ── Fragment shader ───────────────────────────────────────────────────────────

@fragment
fn fragment(in: VertexOutput) -> @location(0) vec4<f32> {
    let raw = textureSample(reflectivity_texture, reflectivity_sampler, in.uv).r;

    // 0.0 is the no-data sentinel for all moment types.
    if raw == 0.0 {
        discard;
    }

    let moment = u32(moment_params.x);
    var color: vec3<f32>;

    if moment == 0u {
        // Reflectivity: raw = dbz / 75
        let dbz = raw * 75.0;
        if dbz < params.x {
            discard;
        }
        color = nws_colormap(dbz);
    } else if moment == 1u {
        // Velocity: raw = (vel + 100) / 200, vel in [-100, 100] m/s
        let vel = raw * 200.0 - 100.0;
        color = velocity_colormap(vel);
    } else if moment == 2u {
        // Spectrum width: raw = sw / 10, sw in [0, 10] m/s
        let sw = raw * 10.0;
        color = spectrum_width_colormap(sw);
    } else if moment == 3u {
        // ZDR: raw = (zdr + 8) / 16, zdr in [-8, 8] dB
        let zdr = raw * 16.0 - 8.0;
        color = zdr_colormap(zdr);
    } else if moment == 4u {
        // CC: raw = cc / 1.05, cc in [0, 1.05]
        let cc = raw * 1.05;
        color = cc_colormap(cc);
    } else {
        // PhiDP: raw = (phi + 180) / 540, phi in [-180, 360] deg
        let phi = raw * 540.0 - 180.0;
        color = phidp_colormap(phi);
    }

    var alpha = 1.0;
    let range_km = params.y;
    if range_km > 0.0 {
        let dx = in.world_position.x - params.z;
        let dz = in.world_position.z - params.w;
        let dist_km = length(vec2<f32>(dx, dz)) / 1000.0;
        if dist_km >= range_km {
            discard;
        }
        let fade_start = range_km * 0.75;
        if dist_km > fade_start {
            alpha = 1.0 - (dist_km - fade_start) / (range_km - fade_start);
        }
    }

    return vec4<f32>(color, alpha);
}
