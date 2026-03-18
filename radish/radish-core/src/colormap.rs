use once_cell::sync::Lazy;
use serde::Deserialize;

#[derive(Debug, Clone, Copy, Deserialize)]
pub struct ColorPoint {
    pub dbz: f32,
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub a: f32,
}

static NWS_LUT: Lazy<Vec<ColorPoint>> = Lazy::new(|| {
    // `CARGO_MANIFEST_DIR` here is `radish/radish-core`.
    let s = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../nws_colormap.json"));
    serde_json::from_str::<Vec<ColorPoint>>(s).expect("invalid nws_colormap.json")
});

/// Lookup color for a given dBZ using the shared LUT.
/// Alpha is supplied by the caller; this function ignores the LUT alpha so that
/// mesh coloring can be controlled independently of the legend fade.
pub fn color_for_dbz(dbz: f32, alpha: f32) -> [f32; 4] {
    let lut = &*NWS_LUT;
    if lut.is_empty() {
        return [0.0, 0.0, 0.0, alpha];
    }

    // Clamp dBZ into LUT range.
    let clamped = dbz
        .max(lut.first().unwrap().dbz)
        .min(lut.last().unwrap().dbz);

    // Find the two surrounding entries for linear interpolation.
    let mut hi = 0;
    while hi < lut.len() && lut[hi].dbz < clamped {
        hi += 1;
    }

    let (c0, c1) = if hi == 0 {
        (lut[0], lut[0])
    } else if hi == lut.len() {
        let last = lut[lut.len() - 1];
        (last, last)
    } else {
        (lut[hi - 1], lut[hi])
    };

    let t = if (c1.dbz - c0.dbz).abs() > f32::EPSILON {
        (clamped - c0.dbz) / (c1.dbz - c0.dbz)
    } else {
        0.0
    };

    let r = c0.r as f32 + t * (c1.r as f32 - c0.r as f32);
    let g = c0.g as f32 + t * (c1.g as f32 - c0.g as f32);
    let b = c0.b as f32 + t * (c1.b as f32 - c0.b as f32);

    [r / 255.0, g / 255.0, b / 255.0, alpha]
}

