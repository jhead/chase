use bevy::prelude::*;
use nexrad_render::{RadarPlugin, RadarVolumeSender};

fn main() {
    let site = get_site_param().unwrap_or_else(|| "KHTX".to_string());

    App::new()
        .add_plugins(DefaultPlugins.set(WindowPlugin {
            primary_window: Some(Window {
                title: "NEXRAD 3D Radar".into(),
                fit_canvas_to_parent: true,
                prevent_default_event_handling: false,
                ..default()
            }),
            ..default()
        }))
        .add_plugins(RadarPlugin::default())
        .add_systems(Startup, setup_camera)
        .add_systems(Startup, move |sender: Res<RadarVolumeSender>| {
            start_fetch(sender.clone(), site.clone());
        })
        .run();
}

fn setup_camera(mut commands: Commands) {
    use nexrad_render::camera::orbit_camera::OrbitCamera;
    let orbit = OrbitCamera::default();
    let transform = orbit.to_transform();
    commands.spawn((Camera3d::default(), transform, orbit));
}

fn start_fetch(sender: RadarVolumeSender, site: String) {
    wasm_bindgen_futures::spawn_local(async move {
        match nexrad_fetch::fetch_latest_volume(&site).await {
            Ok(volume) => {
                let _ = sender.0.try_send(volume);
            }
            Err(e) => log::error!("radar fetch failed: {e}"),
        }
    });
}

/// Read `?site=KHTX` from the browser URL, falling back to `None`.
fn get_site_param() -> Option<String> {
    #[cfg(target_arch = "wasm32")]
    {
        let window = web_sys::window()?;
        let search = window.location().search().ok()?;
        // Parse "?site=KXXX" — minimal query string parsing without pulling in a dep.
        for pair in search.trim_start_matches('?').split('&') {
            let mut kv = pair.splitn(2, '=');
            if kv.next() == Some("site") {
                return kv.next().map(|v| v.to_string());
            }
        }
        None
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        None
    }
}
