/// A single elevation scan (one tilt of the radar antenna).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ElevationScan {
    pub elevation_angle: f32, // degrees above horizon (e.g. 0.5, 1.5, 2.4...)
    pub num_rays: usize,
    pub num_gates: usize,
    pub gate_size_m: f32,  // meters per gate (typically 250m)
    pub first_gate_m: f32, // range to center of first gate in meters
    /// Azimuth angle (degrees, clockwise from north) for each ray.
    pub azimuths: Vec<f32>,
    /// Normalized reflectivity in [0.0, 1.0]. Layout: row-major, index = ray * num_gates + gate.
    pub reflectivity: Vec<f32>,
}

impl ElevationScan {
    /// Generate a synthetic elevation scan for testing.
    pub fn dummy(elevation_angle: f32) -> Self {
        let num_rays = 720usize;
        let num_gates = 500usize;
        let gate_size_m = 500.0_f32;
        let first_gate_m = 2000.0_f32;

        let azimuths: Vec<f32> = (0..num_rays)
            .map(|i| i as f32 * (360.0 / num_rays as f32))
            .collect();

        let mut reflectivity = vec![0.0_f32; num_rays * num_gates];

        for ray_i in 0..num_rays {
            let az = azimuths[ray_i];

            for gate_i in 0..num_gates {
                let dist = gate_i as f32 / num_gates as f32;

                // Blind zone near the radar
                if dist < 0.04 {
                    continue;
                }

                // Background light rain at close range
                let mut val = if dist < 0.3 {
                    (dist - 0.04) / 0.26 * 0.25
                } else {
                    0.0
                };

                // Simulated storm cell: azimuth 30°–120°, gates 30%–65% of range
                if az >= 30.0 && az <= 120.0 && dist >= 0.30 && dist <= 0.65 {
                    let az_center = 75.0_f32;
                    let dist_center = 0.47_f32;
                    let az_spread = ((az - az_center) / 45.0).powi(2);
                    let dist_spread = ((dist - dist_center) / 0.175).powi(2);
                    let intensity = (1.0 - (az_spread + dist_spread).sqrt()).max(0.0);
                    val = val.max(intensity * 0.95);
                }

                // Second weaker cell: azimuth 200°–260°, gates 20%–40%
                if az >= 200.0 && az <= 260.0 && dist >= 0.20 && dist <= 0.40 {
                    let az_center = 230.0_f32;
                    let dist_center = 0.30_f32;
                    let az_spread = ((az - az_center) / 30.0).powi(2);
                    let dist_spread = ((dist - dist_center) / 0.10).powi(2);
                    let intensity = (1.0 - (az_spread + dist_spread).sqrt()).max(0.0);
                    val = val.max(intensity * 0.55);
                }

                reflectivity[ray_i * num_gates + gate_i] = val.clamp(0.0, 1.0);
            }
        }

        Self {
            elevation_angle,
            num_rays,
            num_gates,
            gate_size_m,
            first_gate_m,
            azimuths,
            reflectivity,
        }
    }
}

/// A full volume scan containing multiple elevation sweeps.
#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct RadarVolume {
    pub site: String,
    pub elevations: Vec<ElevationScan>,
}
