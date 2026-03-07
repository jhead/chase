#version 300 es

precision mediump float;

in vec2 vTexCoord;
out vec4 FragColor;

uniform vec2 uResolution;
uniform sampler2D uTexture;
uniform float uNumLines;

#define PI 3.14159265359

vec3 scaleRadarColor(float radarValue) {
    if (radarValue <= 0.0) return vec3(0.0, 0.0, 0.0);

    float rangeStart;
    float rangeEnd;
    vec3 colorStart;
    vec3 colorEnd;

    if (radarValue < 0.2) {
        rangeStart = 0.0;
        rangeEnd = 0.2;
        colorStart = vec3(0.0, 0.0, 0.0);
        colorEnd = vec3(0.2, 0.48, 0.55);
    } else if (radarValue < 0.4) {
        rangeStart = 0.2;
        rangeEnd = 0.4;
        colorStart = vec3(0.07, 0.25, 0.04);
        colorEnd = vec3(0.15, 0.63, 0.2);
    } else if (radarValue < 0.66) {
        rangeStart = 0.4;
        rangeEnd = 0.66;
        colorStart = vec3(1.0, 1.0, 0.0);
        colorEnd = vec3(1.0, 0.5, 0.0);
    } else if (radarValue < 0.8) {
        rangeStart = 0.66;
        rangeEnd = 0.8;
        colorStart = vec3(1.0, 0.0, 0.0);
        colorEnd = vec3(0.37, 0.08, 0.08);
    } else {
        rangeStart = 0.8;
        rangeEnd = 1.0;
        colorStart = vec3(0.68, 0.43, 0.58);
        colorEnd = vec3(0.6, 0.0, 0.30);
    }

    return mix(colorStart, colorEnd, smoothstep(rangeStart, rangeEnd, radarValue));
}

void main() {
    if (vTexCoord.y <= 0.02) {
        FragColor = vec4(scaleRadarColor(vTexCoord.x), 1.0);
        return;
    }

    // Convert to [-1, 1] with X-flipped for clockwise azimuth
    vec2 uv = (vTexCoord * 2.0 - 1.0) * vec2(-1.0, 1.0);

    // Correct for aspect ratio so radar renders as a circle
    uv.x /= uResolution.x / uResolution.y;

    // Distance from origin maps to radar gate index
    float distance = length(uv);

    // Discard pixels outside the radar circle
    if (distance > 1.0) discard;

    // Angle determines the radar ray index (0 = North, clockwise)
    float angle = atan(uv.y, uv.x) - (PI / 2.0);
    if (angle < 0.0) {
        angle += 2.0 * PI;
    }

    float normalizedLineIndex = angle / (2.0 * PI);
    vec2 dataUV = vec2(distance, normalizedLineIndex);
    float radarValue = texture(uTexture, dataUV).r;

    FragColor = vec4(scaleRadarColor(radarValue), 1.0);
}
