//! Unified command bus: JS → Bevy via a single async_channel + Bevy Message.

use bevy::prelude::*;

/// A raw JSON command received from JS, broadcast as a Bevy message.
/// Each plugin adds a system that reads `MessageReader<RawCommand>` and
/// tries to parse its own command type via `from_json()`.
#[derive(Message, Debug, Clone)]
pub struct RawCommand(pub serde_json::Value);

/// Bevy resource holding the receiver half of the single command channel.
/// Inserted by the WASM host (radish-web) before `app.run()`.
#[derive(Resource)]
pub struct CommandBusReceiver(pub async_channel::Receiver<serde_json::Value>);
