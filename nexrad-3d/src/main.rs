mod camera;
mod nexrad;
mod rendering;

use bevy::{light::GlobalAmbientLight, prelude::*};
use camera::{orbit_camera::OrbitCamera, OrbitCameraPlugin};
use nexrad::types::{ElevationScan, RadarVolume};
use rendering::{
    elevation_mesh::build_elevation_mesh,
    radar_material::RadarMaterial,
    radar_texture::create_reflectivity_texture,
};

/// Marks entities that are part of the current radar volume so they can be
/// despawned wholesale when new data arrives.
#[derive(Component)]
struct RadarElevation;

/// Channel through which the background fetch thread delivers a parsed
/// `RadarVolume` to the Bevy main thread.
#[derive(Resource)]
struct RadarDataChannel(async_channel::Receiver<RadarVolume>);

fn main() {
    App::new()
        .add_plugins(DefaultPlugins.set(WindowPlugin {
            primary_window: Some(Window {
                title: "NEXRAD 3D Radar".into(),
                resolution: (1400_u32, 900_u32).into(),
                ..default()
            }),
            ..default()
        }))
        .add_plugins(MaterialPlugin::<RadarMaterial>::default())
        .add_plugins(OrbitCameraPlugin)
        .add_systems(Startup, (setup, start_radar_fetch))
        .add_systems(Update, receive_radar_data)
        .run();
}

/// Compute (lower_elev, upper_elev) slab bounds for each scan in a sorted
/// elevation list.  Adjacent slabs share the same boundary height so the
/// full volume is seamlessly contiguous with no gaps.
fn slab_bounds(scans: &[ElevationScan]) -> Vec<(f32, f32)> {
    let n = scans.len();
    (0..n)
        .map(|i| {
            let lower = if i == 0 {
                0.0_f32
            } else {
                (scans[i - 1].elevation_angle + scans[i].elevation_angle) / 2.0
            };
            let upper = if i + 1 < n {
                (scans[i].elevation_angle + scans[i + 1].elevation_angle) / 2.0
            } else {
                // Extrapolate the same gap above the topmost tilt.
                let gap = if n >= 2 {
                    scans[i].elevation_angle - scans[i - 1].elevation_angle
                } else {
                    2.0
                };
                scans[i].elevation_angle + gap
            };
            (lower, upper)
        })
        .collect()
}

/// Spawn a set of `RadarElevation` mesh entities from a sorted slice of scans.
fn spawn_elevation_entities(
    commands: &mut Commands,
    meshes: &mut Assets<Mesh>,
    materials: &mut Assets<RadarMaterial>,
    images: &mut Assets<Image>,
    scans: &[ElevationScan],
) {
    let bounds = slab_bounds(scans);
    for (scan, (lower, upper)) in scans.iter().zip(bounds.iter()) {
        let mesh = build_elevation_mesh(scan, *lower, *upper);
        let texture = create_reflectivity_texture(images, scan);
        let material = materials.add(RadarMaterial {
            reflectivity_texture: texture,
        });
        commands.spawn((
            Mesh3d(meshes.add(mesh)),
            MeshMaterial3d(material),
            Transform::default(),
            RadarElevation,
        ));
    }
}

fn setup(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<RadarMaterial>>,
    mut images: ResMut<Assets<Image>>,
    mut global_ambient: ResMut<GlobalAmbientLight>,
) {
    // Spawn placeholder dummy data while the real volume loads in the background.
    let mut dummy_scans: Vec<ElevationScan> = [0.5_f32, 1.5, 2.4, 3.4, 4.3]
        .iter()
        .map(|&e| ElevationScan::dummy(e))
        .collect();
    dummy_scans.sort_by(|a, b| {
        a.elevation_angle
            .partial_cmp(&b.elevation_angle)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    spawn_elevation_entities(
        &mut commands,
        &mut meshes,
        &mut materials,
        &mut images,
        &dummy_scans,
    );

    let orbit = OrbitCamera::default();
    let transform = orbit.to_transform();
    commands.spawn((Camera3d::default(), transform, orbit));

    global_ambient.brightness = 1000.0;
}

/// Spawn a background thread that runs a tokio runtime, fetches the latest
/// KHTX volume via the CF Worker proxy, parses it, and sends the result on
/// the channel.  We use a dedicated thread rather than Bevy's IoTaskPool
/// because `reqwest` requires a running tokio runtime.
fn start_radar_fetch(mut commands: Commands) {
    let (tx, rx) = async_channel::unbounded::<RadarVolume>();
    commands.insert_resource(RadarDataChannel(rx));

    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("tokio runtime");

        rt.block_on(async move {
            match nexrad::client::fetch_latest_volume("KHTX").await {
                Ok(volume) => {
                    let _ = tx.try_send(volume);
                }
                Err(e) => warn!("radar fetch failed: {e}"),
            }
        });
    });
}

/// Each frame: check whether the background thread has delivered a new volume.
/// When it has, despawn all placeholder / previous elevation entities and spawn
/// fresh ones from the real data.
fn receive_radar_data(
    mut commands: Commands,
    channel: Res<RadarDataChannel>,
    old_elevations: Query<Entity, With<RadarElevation>>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<RadarMaterial>>,
    mut images: ResMut<Assets<Image>>,
) {
    let Ok(volume) = channel.0.try_recv() else {
        return;
    };

    for entity in &old_elevations {
        commands.entity(entity).despawn();
    }

    let mut scans = volume.elevations;
    scans.sort_by(|a, b| {
        a.elevation_angle
            .partial_cmp(&b.elevation_angle)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    spawn_elevation_entities(
        &mut commands,
        &mut meshes,
        &mut materials,
        &mut images,
        &scans,
    );

    info!(
        "loaded {} elevation sweeps from {}",
        scans.len(),
        volume.site
    );
}
