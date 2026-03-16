//! Unified event bus: Bevy → JS via a single Bevy Message drained by nexrad-web.

use bevy::prelude::*;

/// A named event emitted by any plugin, forwarded to JS by the WASM host.
///
/// - `name`: stable string like `"state_update"`, `"alert_click"`, `"site_click"`
/// - `data`: JSON-serializable string payload
#[derive(Message, Debug, Clone)]
pub struct PluginEvent {
    pub name: String,
    pub data: String,
}
