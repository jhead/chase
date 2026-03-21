use nexrad_data::volume::File;
use nexrad_model::data::{MomentValue, Radial, Sweep};

use crate::types::{ElevationScan, RadarVolume};

/// Parse a raw NEXRAD Level II archive file (bytes) into a `RadarVolume`
/// containing one `ElevationScan` per elevation tilt.
pub fn parse_volume(site: &str, data: Vec<u8>) -> Result<RadarVolume, String> {
    let file = File::new(data);
    let scan = file
        .scan()
        .map_err(|e| format!("nexrad-data scan decode failed: {e}"))?;

    let elevations: Vec<ElevationScan> = scan
        .sweeps()
        .iter()
        .filter_map(sweep_to_elevation_scan)
        .collect();

    if elevations.is_empty() {
        return Err(format!("no elevation scans decoded from {site} volume"));
    }

    log::info!(
        "parsed {} elevation sweeps from {site}",
        elevations.len()
    );
    Ok(RadarVolume {
        site: site.to_string(),
        elevations,
    })
}

/// Extract and normalise a single moment from sorted radials into a flat Vec<f32>.
///
/// All values are in [0.0, 1.0]; BelowThreshold / RangeFolded → 0.0 (no-data sentinel).
/// Gate data is padded with 0.0 or truncated to `num_gates` so all moments share the same layout.
fn extract_moment<F>(
    sorted: &[&Radial],
    num_rays: usize,
    num_gates: usize,
    getter: F,
    normalize: impl Fn(f32) -> f32,
) -> Option<Vec<f32>>
where
    F: Fn(&Radial) -> Option<&nexrad_model::data::MomentData>,
{
    if !sorted.iter().any(|r| getter(r).is_some()) {
        return None;
    }

    let mut data = vec![0.0_f32; num_rays * num_gates];
    for (ray_i, radial) in sorted.iter().enumerate() {
        let Some(moment) = getter(radial) else { continue };
        for (gate_i, val) in moment.values().iter().enumerate() {
            if gate_i >= num_gates {
                break;
            }
            let v = match val {
                MomentValue::Value(v) => normalize(*v).clamp(0.0, 1.0),
                MomentValue::BelowThreshold | MomentValue::RangeFolded => 0.0,
            };
            data[ray_i * num_gates + gate_i] = v;
        }
    }
    Some(data)
}

/// Convert one `nexrad_model` sweep into our `ElevationScan`.
///
/// Returns `None` if the sweep has no radials with reflectivity data.
pub fn sweep_to_elevation_scan(sweep: &Sweep) -> Option<ElevationScan> {
    let radials = sweep.radials();
    if radials.is_empty() {
        return None;
    }

    // Determine num_gates from the first radial that has reflectivity.
    let num_gates = radials
        .iter()
        .find_map(|r| r.reflectivity().map(|m| m.values().len()))?;

    if num_gates == 0 {
        return None;
    }

    // Sort radials by azimuth angle for consistent UV mapping.
    let mut sorted: Vec<_> = radials.iter().collect();
    sorted.sort_by(|a, b| {
        a.azimuth_angle_degrees()
            .partial_cmp(&b.azimuth_angle_degrees())
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let elevation_angle = sorted[0].elevation_angle_degrees();
    let num_rays = sorted.len();

    // NEXRAD super-resolution (VCP 212/215) reflectivity gate geometry.
    // Gate size 250 m, first gate centre at 2125 m; num_gates comes from the data.
    let gate_size_m = 250.0_f32;
    let first_gate_m = 2125.0_f32;

    let azimuths: Vec<f32> = sorted.iter().map(|r| r.azimuth_angle_degrees()).collect();

    let mut reflectivity = vec![0.0_f32; num_rays * num_gates];

    for (ray_i, radial) in sorted.iter().enumerate() {
        let Some(ref_data) = radial.reflectivity() else {
            continue;
        };
        for (gate_i, val) in ref_data.values().iter().enumerate() {
            if gate_i >= num_gates {
                break;
            }
            let normalized = match val {
                // dBZ / 75 matches the existing React app normalisation.
                MomentValue::Value(dbz) => (dbz / 75.0).clamp(0.0, 1.0),
                MomentValue::BelowThreshold | MomentValue::RangeFolded => 0.0,
            };
            reflectivity[ray_i * num_gates + gate_i] = normalized;
        }
    }

    // Extract dual-pol / Doppler moments. Each uses the same gate layout as reflectivity.
    let velocity = extract_moment(
        &sorted, num_rays, num_gates,
        |r| r.velocity(),
        |v| (v + 100.0) / 200.0,
    );

    let spectrum_width = extract_moment(
        &sorted, num_rays, num_gates,
        |r| r.spectrum_width(),
        |v| v / 10.0,
    );

    let differential_reflectivity = extract_moment(
        &sorted, num_rays, num_gates,
        |r| r.differential_reflectivity(),
        |v| (v + 8.0) / 16.0,
    );

    let correlation_coefficient = extract_moment(
        &sorted, num_rays, num_gates,
        |r| r.correlation_coefficient(),
        |v| v / 1.05,
    );

    let differential_phase = extract_moment(
        &sorted, num_rays, num_gates,
        |r| r.differential_phase(),
        |v| (v + 180.0) / 540.0,
    );

    Some(ElevationScan {
        elevation_angle,
        num_rays,
        num_gates,
        gate_size_m,
        first_gate_m,
        azimuths,
        reflectivity,
        velocity,
        spectrum_width,
        differential_reflectivity,
        correlation_coefficient,
        differential_phase,
    })
}
