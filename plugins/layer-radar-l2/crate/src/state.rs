use bevy::prelude::*;
use serde::Serialize;
use std::collections::HashMap;

// ── Per-layer state ───────────────────────────────────────────────────────────

#[derive(Clone, Default)]
pub struct BaseTextureDims {
    pub num_rays: usize,
    pub num_gates: usize,
}

#[derive(Clone, Default)]
pub struct RadarLayerState {
    pub elevation_count: u32,
    pub elevation_total: u32,
    pub threshold_dbz: f32,
    pub site_world_pos: Vec3,
    pub base_dims: BaseTextureDims,
    pub site_id: Option<String>,
}

impl RadarLayerState {
    pub fn new(threshold_dbz: f32) -> Self {
        Self { threshold_dbz, ..default() }
    }
}

#[derive(Resource, Default)]
pub struct RadarLayerStates(pub HashMap<String, RadarLayerState>);

// ── UiState ───────────────────────────────────────────────────────────────────

#[derive(Serialize, Clone, Default)]
pub struct UiRadarLayerState {
    pub layer_id: String,
    pub site: Option<String>,
    pub elevation_count: u32,
    pub elevation_total: u32,
    pub threshold_dbz: f32,
}

#[derive(Serialize, Clone, Default)]
pub struct UiState {
    pub radar_loaded: bool,
    pub active_site: Option<String>,
    pub elevation_count: u32,
    pub elevation_total: u32,
    pub threshold_dbz: f32,
    pub radar_layers: Vec<UiRadarLayerState>,
}

impl UiState {
    pub fn sync_layers(&mut self, layer_states: &RadarLayerStates) {
        self.radar_layers = layer_states.0.iter().map(|(id, s)| UiRadarLayerState {
            layer_id: id.clone(),
            site: s.site_id.clone(),
            elevation_count: s.elevation_count,
            elevation_total: s.elevation_total,
            threshold_dbz: s.threshold_dbz,
        }).collect();
        self.radar_layers.sort_by(|a, b| a.layer_id.cmp(&b.layer_id));

        if let Some(primary) = layer_states.0.get("radar-1")
            .or_else(|| layer_states.0.values().next())
        {
            self.active_site = primary.site_id.clone();
            self.elevation_count = primary.elevation_count;
            self.elevation_total = primary.elevation_total;
            self.threshold_dbz = primary.threshold_dbz;
        }
    }
}

#[derive(Resource, Default)]
pub struct StateNotifier(pub Option<Box<dyn Fn(&UiState) + Send + Sync>>);

impl StateNotifier {
    pub fn notify(&self, state: &UiState) {
        if let Some(f) = &self.0 {
            f(state);
        }
    }
}

#[derive(Resource, Default)]
pub struct UiStateResource(pub UiState);
