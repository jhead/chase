/// Convert WGS84 geographic coordinates to Bevy world-space (ENU, meters).
///
/// Uses a flat-Earth approximation valid within ~500km of the origin,
/// which covers the full NEXRAD radar range. Error is <0.1% at 460km.
///
/// Bevy coordinate convention (same as `beam_height::polar_to_world`):
///   X = East, Y = Up (always 0 for basemap), Z = -North
///
/// # Arguments
/// - `lat`, `lng`: WGS84 degrees
/// - `origin_lat`, `origin_lng`: Radar site (or composite view center) in WGS84 degrees
///
/// Returns `(x, 0.0, z)` suitable for placement on the Y=0 ground plane.
pub fn wgs84_to_bevy(lat: f64, lng: f64, origin_lat: f64, origin_lng: f64) -> (f32, f32, f32) {
    const R: f64 = 6_371_000.0; // meters, matches beam_height.rs RE_KM * 1000
    let dlat = (lat - origin_lat).to_radians();
    let dlng = (lng - origin_lng).to_radians();
    let east = dlng * origin_lat.to_radians().cos() * R;
    let north = dlat * R;
    (east as f32, 0.0, -north as f32) // -north because Bevy Z = South
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn origin_maps_to_zero() {
        let (x, y, z) = wgs84_to_bevy(29.47, -95.08, 29.47, -95.08);
        assert!(x.abs() < 1.0, "x = {x}");
        assert_eq!(y, 0.0);
        assert!(z.abs() < 1.0, "z = {z}");
    }

    #[test]
    fn north_is_negative_z() {
        // Point due north of origin should have negative Z (same convention as polar_to_world)
        let (x, _y, z) = wgs84_to_bevy(30.47, -95.08, 29.47, -95.08);
        assert!(x.abs() < 1000.0, "x should be ~0, got {x}");
        assert!(z < 0.0, "z should be negative (north), got {z}");
    }

    #[test]
    fn east_is_positive_x() {
        let (x, _y, z) = wgs84_to_bevy(29.47, -94.08, 29.47, -95.08);
        assert!(x > 0.0, "x should be positive (east), got {x}");
        assert!(z.abs() < 1000.0, "z should be ~0, got {z}");
    }

    #[test]
    fn scale_roughly_correct() {
        // 1 degree latitude ≈ 111km. Point is 1° south of origin → z > 0 (south = +Z).
        let (_, _, z) = wgs84_to_bevy(28.47, -95.08, 29.47, -95.08);
        let dist_km = z / 1000.0;
        assert!((dist_km - 111.0).abs() < 5.0, "dist = {dist_km} km");
    }
}
