//! Shared types used by all overlay/layer plugins.

use bevy::prelude::*;
use std::collections::HashMap;

/// Tags an overlay entity with its layer ID (e.g. `"radar-sites"`, `"basemap"`).
/// Used to show/hide all entities belonging to a layer via `SetLayerVisible` command.
#[derive(Component, Clone, Debug)]
pub struct OverlayLayerId(pub String);

/// Callback invoked when a radar site marker is clicked.
/// Set by the WASM layer to forward site_id to React.
#[derive(Resource, Default)]
pub struct SiteClickNotifier(pub Option<Box<dyn Fn(&str) + Send + Sync>>);

impl SiteClickNotifier {
    pub fn notify(&self, site_id: &str) {
        if let Some(f) = &self.0 {
            f(site_id);
        }
    }
}

/// Registry of known radar sites, populated dynamically at runtime.
/// Keyed by 4-letter ICAO site ID (e.g. `"KTLX"`), value is `(lat, lng)`.
#[derive(Resource, Default)]
pub struct SiteRegistry(pub HashMap<String, (f64, f64)>);

impl SiteRegistry {
    pub fn lookup(&self, id: &str) -> Option<(f64, f64)> {
        self.0.get(id).copied()
    }
}
