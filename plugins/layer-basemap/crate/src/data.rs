use geojson::{GeoJson, Geometry, Value};
use radish_core::geo::wgs84_to_bevy;

const STATES_GEOJSON: &str = include_str!("data/states.geojson");
const COUNTRIES_GEOJSON: &str = include_str!("data/countries.geojson");
const COASTLINE_GEOJSON: &str = include_str!("data/coastline.geojson");
const LAKES_GEOJSON: &str = include_str!("data/lakes.geojson");

/// A layer of basemap line segments, ready to be turned into a Bevy LineList mesh.
/// Each pair of consecutive vertices is one line segment: [a, b, c, d] → segments (a,b), (c,d).
pub struct BasemapLayer {
    /// Flat list of vertex pairs: [start, end, start, end, …]
    pub vertices: Vec<[f32; 3]>,
}

/// All basemap layers projected to local ENU centered on the given radar origin.
pub struct BasemapData {
    pub states: BasemapLayer,
    pub countries: BasemapLayer,
    pub coastline: BasemapLayer,
    pub lakes: BasemapLayer,
}

impl BasemapData {
    pub fn build(origin_lat: f64, origin_lng: f64, cull_radius_m: f64) -> Self {
        Self {
            states: parse_layer(STATES_GEOJSON, origin_lat, origin_lng, cull_radius_m),
            countries: parse_layer(COUNTRIES_GEOJSON, origin_lat, origin_lng, cull_radius_m),
            coastline: parse_layer(COASTLINE_GEOJSON, origin_lat, origin_lng, cull_radius_m),
            lakes: parse_layer(LAKES_GEOJSON, origin_lat, origin_lng, cull_radius_m),
        }
    }
}

fn parse_layer(json: &str, origin_lat: f64, origin_lng: f64, cull_radius_m: f64) -> BasemapLayer {
    let mut vertices = Vec::new();

    let Ok(geojson) = json.parse::<GeoJson>() else {
        log::error!("Failed to parse basemap GeoJSON");
        return BasemapLayer { vertices };
    };

    match geojson {
        GeoJson::FeatureCollection(fc) => {
            for feature in fc.features {
                if let Some(geometry) = feature.geometry {
                    extract_lines(&geometry, origin_lat, origin_lng, cull_radius_m, &mut vertices);
                }
            }
        }
        GeoJson::Feature(f) => {
            if let Some(geometry) = f.geometry {
                extract_lines(&geometry, origin_lat, origin_lng, cull_radius_m, &mut vertices);
            }
        }
        GeoJson::Geometry(g) => {
            extract_lines(&g, origin_lat, origin_lng, cull_radius_m, &mut vertices);
        }
    }

    BasemapLayer { vertices }
}

fn extract_lines(
    geometry: &Geometry,
    origin_lat: f64,
    origin_lng: f64,
    cull_radius_m: f64,
    vertices: &mut Vec<[f32; 3]>,
) {
    match &geometry.value {
        Value::LineString(coords) => {
            push_line_string(coords, origin_lat, origin_lng, cull_radius_m, vertices);
        }
        Value::MultiLineString(lines) => {
            for line in lines {
                push_line_string(line, origin_lat, origin_lng, cull_radius_m, vertices);
            }
        }
        Value::Polygon(rings) => {
            for ring in rings {
                push_line_string(ring, origin_lat, origin_lng, cull_radius_m, vertices);
            }
        }
        Value::MultiPolygon(polygons) => {
            for polygon in polygons {
                for ring in polygon {
                    push_line_string(ring, origin_lat, origin_lng, cull_radius_m, vertices);
                }
            }
        }
        Value::GeometryCollection(geoms) => {
            for g in geoms {
                extract_lines(g, origin_lat, origin_lng, cull_radius_m, vertices);
            }
        }
        _ => {}
    }
}

/// Converts a GeoJSON coordinate ring/line into LineList vertex pairs (a, b, c, d → (a,b), (c,d)).
fn push_line_string(
    coords: &[Vec<f64>],
    origin_lat: f64,
    origin_lng: f64,
    cull_radius_m: f64,
    vertices: &mut Vec<[f32; 3]>,
) {
    if coords.len() < 2 {
        return;
    }

    let project = |c: &Vec<f64>| -> Option<[f32; 3]> {
        let lng = *c.first()?;
        let lat = *c.get(1)?;
        let (x, y, z) = wgs84_to_bevy(lat, lng, origin_lat, origin_lng);
        // Cull: skip points beyond the cull radius
        let dist_sq = (x as f64).powi(2) + (z as f64).powi(2);
        if dist_sq > cull_radius_m * cull_radius_m {
            None
        } else {
            Some([x, y, z])
        }
    };

    for window in coords.windows(2) {
        let Some(a) = project(&window[0]) else { continue };
        let Some(b) = project(&window[1]) else { continue };
        vertices.push(a);
        vertices.push(b);
    }
}
