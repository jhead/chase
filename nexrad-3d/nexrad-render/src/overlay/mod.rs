//! Overlay layers rendered on top of the basemap (e.g. radar site icons).
//! Shared types for all overlay layers to allow a consistent add/remove/toggle pattern.

use bevy::prelude::*;

/// Tags an overlay entity with its layer ID (e.g. `"radar-sites"`).
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

pub mod radar_sites;
