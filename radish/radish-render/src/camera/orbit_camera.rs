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

/// System set label for the orbit camera update, used to enforce run ordering
/// with `drain_js_commands` (which must run first to populate `PendingZoomAtPoint`).
#[derive(SystemSet, Debug, Hash, PartialEq, Eq, Clone)]
pub enum CameraSystemSet {
    OrbitCamera,
}

/// Zoom-at-point command queued by `drain_js_commands` for the current frame.
/// Holds `(delta, viewport_pos)` where delta > 0 = zoom in (same sign as scroll delta).
#[derive(Resource, Default)]
pub struct PendingZoomAtPoint(pub Option<(f32, Vec2)>);

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
            .init_resource::<PendingZoomAtPoint>()
            .add_systems(Startup, spawn_camera)
            .add_systems(Update, orbit_camera_system.in_set(CameraSystemSet::OrbitCamera));
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
        MeshPickingCamera::default(),
        cam,
        transform,
    ));
}

/// Returns the world-space point where a ray from `viewport_pos` intersects the
/// horizontal plane (Y = focus.y). Used for both pan and zoom-to-pointer.
fn world_point_under_viewport(
    camera: &Camera,
    global_transform: &GlobalTransform,
    viewport_pos: Vec2,
    focus: Vec3,
) -> Option<Vec3> {
    let ray = camera.viewport_to_world(global_transform, viewport_pos).ok()?;
    let t = ray.intersect_plane(focus, InfinitePlane3d::new(Vec3::Y))?;
    Some(ray.get_point(t))
}

fn orbit_camera_system(
    mut query: Query<(&mut OrbitCamera, &mut Transform, &Camera, &GlobalTransform)>,
    mouse: Res<AccumulatedMouseMotion>,
    scroll: Res<AccumulatedMouseScroll>,
    buttons: Res<ButtonInput<MouseButton>>,
    mode: Res<CameraMode>,
    windows: Query<&Window>,
    mut pending_zoom: ResMut<PendingZoomAtPoint>,
) {
    let Ok((mut cam, mut transform, camera, global_transform)) = query.single_mut() else {
        return;
    };

    // Zoom-to-pointer: consume pinch command (from JS) or build one from scroll + cursor
    let scroll_delta = match scroll.unit {
        MouseScrollUnit::Line  => scroll.delta.y * 0.12,
        MouseScrollUnit::Pixel => scroll.delta.y * 0.001,
    };
    let zoom_cmd: Option<(f32, Vec2)> = pending_zoom.0.take().or_else(|| {
        if scroll_delta.abs() == 0.0 { return None; }
        windows.single().ok()?.cursor_position().map(|p| (scroll_delta, p))
    });

    if let Some((delta, viewport_pos)) = zoom_cmd {
        let new_radius = (cam.radius * (1.0 - delta)).clamp(1_000.0, 5_000_000.0);
        if let Some(world_pt) = world_point_under_viewport(camera, global_transform, viewport_pos, cam.focus) {
            cam.focus = world_pt + (cam.focus - world_pt) * (new_radius / cam.radius);
        }
        cam.radius = new_radius;
    } else if scroll_delta.abs() > 0.0 {
        // Fallback: cursor unavailable (e.g. trackpad scroll without hover) — center zoom
        cam.radius = (cam.radius * (1.0 - scroll_delta)).clamp(1_000.0, 5_000_000.0);
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
                if let Some(world_pos) = world_point_under_viewport(camera, global_transform, cursor, cam.focus) {
                    if let Some(grab) = cam.pan_grab {
                        cam.focus += grab - world_pos;
                    } else {
                        cam.pan_grab = Some(world_pos);
                    }
                }
            }
        }
    } else {
        cam.pan_grab = None;
    }

    *transform = cam.to_transform();
}
