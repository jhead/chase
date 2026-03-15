use bevy::{
    input::mouse::{AccumulatedMouseMotion, AccumulatedMouseScroll, MouseScrollUnit},
    prelude::*,
};

/// Controls which mouse button pans vs. tilts (orbits).
///
/// - `Pan2D`: left drag = pan, right drag = tilt (map-like, default)
/// - `Tilt3D`: left drag = tilt, right drag = pan (Blender-like)
#[derive(Resource, Default, Debug, PartialEq, Eq, Clone, Copy)]
pub enum CameraMode {
    #[default]
    Pan2D,
    Tilt3D,
}

#[derive(Component)]
pub struct OrbitCamera {
    /// World-space point the camera orbits around.
    pub focus: Vec3,
    /// Distance from focus in meters.
    pub radius: f32,
    /// Horizontal rotation in radians (around Y-axis).
    pub yaw: f32,
    /// Vertical tilt in radians. 0 = horizon, PI/2 = straight down.
    pub pitch: f32,
    /// World-space grab point for pixel-perfect pan; cleared when pan button released.
    pub pan_grab: Option<Vec3>,
}

impl Default for OrbitCamera {
    fn default() -> Self {
        Self {
            focus: Vec3::ZERO,
            radius: 400_000.0, // 400km — full overview of a ~250km radar range
            yaw: 0.0,          // compass north, no rotation
            pitch: std::f32::consts::FRAC_PI_2 - 0.02, // nearly top-down (~89°)
            pan_grab: None,
        }
    }
}

impl OrbitCamera {
    pub fn to_transform(&self) -> Transform {
        let pitch = self.pitch.clamp(0.05, std::f32::consts::FRAC_PI_2 - 0.01);
        let offset = Vec3::new(
            self.radius * self.yaw.sin() * pitch.cos(),
            self.radius * pitch.sin(),
            self.radius * self.yaw.cos() * pitch.cos(),
        );
        Transform::from_translation(self.focus + offset).looking_at(self.focus, Vec3::Y)
    }
}

pub struct OrbitCameraPlugin;

impl Plugin for OrbitCameraPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<CameraMode>()
            .add_systems(Startup, spawn_camera)
            .add_systems(Update, orbit_camera_system);
    }
}

pub fn spawn_camera(mut commands: Commands) {
    let cam = OrbitCamera::default();
    let transform = cam.to_transform();
    commands.spawn((
        Camera3d::default(),
        Projection::Perspective(PerspectiveProjection {
            near: 100.0,
            // Native uses perspective_infinite_reverse_rh (far ignored).
            // WASM/WebGL2 uses a finite projection, so we need a large far.
            far: 5_000_000.0,
            ..default()
        }),
        cam,
        transform,
    ));
}

fn orbit_camera_system(
    mut query: Query<(&mut OrbitCamera, &mut Transform, &Camera, &GlobalTransform)>,
    mouse: Res<AccumulatedMouseMotion>,
    scroll: Res<AccumulatedMouseScroll>,
    buttons: Res<ButtonInput<MouseButton>>,
    mode: Res<CameraMode>,
    windows: Query<&Window>,
) {
    let Ok((mut cam, mut transform, camera, global_transform)) = query.single_mut() else {
        return;
    };

    // Scroll to zoom
    let scroll_delta = match scroll.unit {
        MouseScrollUnit::Line => scroll.delta.y * 0.12,
        MouseScrollUnit::Pixel => scroll.delta.y * 0.001,
    };
    if scroll_delta.abs() > 0.0 {
        cam.radius *= 1.0 - scroll_delta;
        cam.radius = cam.radius.clamp(1_000.0, 5_000_000.0);
    }

    let (tilt_button, pan_button) = match *mode {
        CameraMode::Pan2D  => (MouseButton::Right, MouseButton::Left),
        CameraMode::Tilt3D => (MouseButton::Left,  MouseButton::Right),
    };

    // Tilt: delta-based rotation
    if buttons.pressed(tilt_button) && mouse.delta != Vec2::ZERO {
        cam.yaw -= mouse.delta.x * 0.005;
        cam.pitch += mouse.delta.y * 0.005;
        cam.pitch = cam.pitch.clamp(0.05, std::f32::consts::FRAC_PI_2 - 0.01);
    }

    // Pan: ray-plane intersection so the grabbed world point stays under the cursor
    if buttons.pressed(pan_button) {
        if let Ok(window) = windows.single() {
            if let Some(cursor) = window.cursor_position() {
                if let Ok(ray) = camera.viewport_to_world(global_transform, cursor) {
                    let plane_origin = cam.focus;
                    if let Some(t) = ray.intersect_plane(plane_origin, InfinitePlane3d::new(Vec3::Y)) {
                        let world_pos = ray.get_point(t);
                        if let Some(grab) = cam.pan_grab {
                            cam.focus += grab - world_pos;
                        } else {
                            cam.pan_grab = Some(world_pos);
                        }
                    }
                }
            }
        }
    } else {
        cam.pan_grab = None;
    }

    *transform = cam.to_transform();
}
