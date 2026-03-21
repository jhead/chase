use crate::RadarMoment;

/// Commands specific to the radar L2 plugin, parsed from JSON.
#[derive(Debug, Clone)]
pub enum RadarL2Command {
    /// Despawn all entities for a layer and remove its state.
    RemoveLayer { layer_id: String },
    /// Set how many elevation tilts are shown for a specific radar layer.
    SetElevationCount { layer_id: String, count: u32 },
    /// Set the minimum dBZ threshold for a specific radar layer.
    SetThreshold { layer_id: String, dbz: f32 },
    /// Set the render range cap in km for a specific radar layer.
    SetRangeKm { layer_id: String, range_km: f32 },
    /// Switch the active radar moment (product) for a layer.
    SetActiveMoment { layer_id: String, moment: RadarMoment },
}

impl RadarL2Command {
    pub fn from_json(v: &serde_json::Value) -> Option<Self> {
        match v["type"].as_str()? {
            "RemoveLayer" => {
                let layer_id = v["layer_id"].as_str()?.to_string();
                Some(RadarL2Command::RemoveLayer { layer_id })
            }
            "SetElevationCount" => {
                let layer_id = v["layer_id"].as_str().unwrap_or("radar-1").to_string();
                let count = v["count"].as_u64()? as u32;
                Some(RadarL2Command::SetElevationCount { layer_id, count })
            }
            "SetThreshold" => {
                let layer_id = v["layer_id"].as_str().unwrap_or("radar-1").to_string();
                let dbz = v["dbz"].as_f64()? as f32;
                Some(RadarL2Command::SetThreshold { layer_id, dbz })
            }
            "SetRangeKm" => {
                let layer_id = v["layer_id"].as_str().unwrap_or("radar-1").to_string();
                let range_km = v["range_km"].as_f64()? as f32;
                Some(RadarL2Command::SetRangeKm { layer_id, range_km })
            }
            "SetActiveMoment" => {
                let layer_id = v["layer_id"].as_str().unwrap_or("radar-1").to_string();
                let moment_str = v["moment"].as_str()?;
                let moment = match moment_str {
                    "reflectivity" => RadarMoment::Reflectivity,
                    "velocity" => RadarMoment::Velocity,
                    "spectrum_width" => RadarMoment::SpectrumWidth,
                    "differential_reflectivity" => RadarMoment::DifferentialReflectivity,
                    "correlation_coefficient" => RadarMoment::CorrelationCoefficient,
                    "differential_phase" => RadarMoment::DifferentialPhase,
                    _ => return None,
                };
                Some(RadarL2Command::SetActiveMoment { layer_id, moment })
            }
            _ => None,
        }
    }
}
