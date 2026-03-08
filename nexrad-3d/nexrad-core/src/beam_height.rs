/// Beam center height above radar using the standard 4/3 Earth radius model.
///
/// - `range_m`: slant range in meters
/// - `elev_deg`: elevation angle in degrees
/// - Returns height above radar elevation in meters
pub fn beam_height_m(range_m: f64, elev_deg: f64) -> f64 {
    const KE: f64 = 4.0 / 3.0;
    const RE_KM: f64 = 6371.0;

    let r_km = range_m / 1000.0;
    let ke_re = KE * RE_KM;
    let theta = elev_deg.to_radians();

    let h_km =
        (r_km * r_km + ke_re * ke_re + 2.0 * r_km * ke_re * theta.sin()).sqrt() - ke_re;
    h_km * 1000.0
}

/// Convert radar polar coordinates to Bevy world space (ENU, meters from radar site).
///
/// Bevy coordinate system: X = East, Y = Up, Z = South (−Z = North).
/// Returns (x, y, z) in meters.
pub fn polar_to_world(range_m: f64, azimuth_deg: f64, elev_deg: f64) -> (f32, f32, f32) {
    let h = beam_height_m(range_m, elev_deg);
    let ground_range = range_m * elev_deg.to_radians().cos();
    let az = azimuth_deg.to_radians();

    let east = ground_range * az.sin();   // X
    let north = ground_range * az.cos();  // −Z in Bevy
    let up = h;                           // Y

    (east as f32, up as f32, -north as f32)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn beam_height_at_horizon() {
        // At 0° elevation and 100km range, beam should be near 0 height
        let h = beam_height_m(100_000.0, 0.0);
        assert!(h.abs() < 1000.0, "h = {h}");
    }

    #[test]
    fn beam_height_at_half_degree() {
        // At 0.5° elevation and 460km range, beam should be ~4km
        let h = beam_height_m(460_000.0, 0.5);
        assert!(h > 3000.0 && h < 6000.0, "h = {h}");
    }

    #[test]
    fn north_is_negative_z() {
        let (x, _y, z) = polar_to_world(100_000.0, 0.0, 0.5);
        assert!(x.abs() < 1000.0, "x should be ~0 for north azimuth, got {x}");
        assert!(z < 0.0, "z should be negative (north) for az=0, got {z}");
    }
}
