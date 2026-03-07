mod camera;
mod nexrad;
mod rendering;

use bevy::{light::GlobalAmbientLight, prelude::*};
use camera::{orbit_camera::OrbitCamera, OrbitCameraPlugin};
use nexrad::types::ElevationScan;
use rendering::{
    elevation_mesh::build_elevation_mesh, radar_material::RadarMaterial,
    radar_texture::create_reflectivity_texture,
};

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
        .add_systems(Startup, setup)
        .run();
}

fn setup(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<RadarMaterial>>,
    mut images: ResMut<Assets<Image>>,
    mut global_ambient: ResMut<GlobalAmbientLight>,
) {
    // Spawn several dummy elevation scans to show the "birthday cake" cone structure.
    let elevations = [0.5_f32, 1.5, 2.4, 3.4, 4.3];
    for &elev in &elevations {
        let scan = ElevationScan::dummy(elev);
        let mesh = build_elevation_mesh(&scan);
        let texture = create_reflectivity_texture(&mut images, &scan);
        let material = materials.add(RadarMaterial {
            reflectivity_texture: texture,
        });
        commands.spawn((
            Mesh3d(meshes.add(mesh)),
            MeshMaterial3d(material),
            Transform::default(),
        ));
    }

    // Camera with orbit controller
    let orbit = OrbitCamera::default();
    let transform = orbit.to_transform();
    commands.spawn((Camera3d::default(), transform, orbit));

    // Bright ambient so custom shader faces are visible (no directional light needed)
    global_ambient.brightness = 1000.0;
}
