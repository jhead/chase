//! Shared types used by all overlay/layer plugins.

use bevy::prelude::*;

/// Tags an overlay entity with its layer ID (e.g. `"radar-sites"`, `"basemap"`).
/// Used to show/hide all entities belonging to a layer via `SetLayerVisible` command.
#[derive(Component, Clone, Debug)]
pub struct OverlayLayerId(pub String);
