use bevy::{
    input::mouse::{AccumulatedMouseMotion, AccumulatedMouseScroll, MouseScrollUnit},
    prelude::*,
};

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
}

impl Default for OrbitCamera {
    fn default() -> Self {
        Self {
            focus: Vec3::ZERO,
            radius: 400_000.0, // 400km — full overview of a ~250km radar range
            yaw: 0.3,
            pitch: 1.1, // ~63° from horizontal — nice perspective
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
        app.add_systems(Startup, spawn_camera)
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
    mut query: Query<(&mut OrbitCamera, &mut Transform)>,
    mouse: Res<AccumulatedMouseMotion>,
    scroll: Res<AccumulatedMouseScroll>,
    buttons: Res<ButtonInput<MouseButton>>,
) {
    let Ok((mut cam, mut transform)) = query.single_mut() else {
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

    // Left drag: orbit
    if buttons.pressed(MouseButton::Left) && mouse.delta != Vec2::ZERO {
        cam.yaw -= mouse.delta.x * 0.005;
        cam.pitch += mouse.delta.y * 0.005;
        cam.pitch = cam.pitch.clamp(0.05, std::f32::consts::FRAC_PI_2 - 0.01);
    }
    // Right drag: pan (translate focus on the XZ plane)
    else if buttons.pressed(MouseButton::Right) && mouse.delta != Vec2::ZERO {
        let pan_speed = cam.radius * 0.001;
        let right = Vec3::new(cam.yaw.cos(), 0.0, -cam.yaw.sin());
        let forward_xz = Vec3::new(-cam.yaw.sin(), 0.0, -cam.yaw.cos());
        cam.focus += right * (-mouse.delta.x * pan_speed);
        cam.focus += forward_xz * (-mouse.delta.y * pan_speed);
    }

    *transform = cam.to_transform();
}
