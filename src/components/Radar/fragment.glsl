#version 300 es

precision mediump float;

in vec2 vTexCoord;
out vec4 FragColor;

uniform vec2 uResolution;
uniform sampler2D uTexture;
uniform float uNumLines;

#define PI 3.14159265359

vec3 scaleRadarColor(float radarValue) {
    float rangeStart = 0.0;
    float rangeEnd = 1.0;
    vec3 colorStart = vec3(0.0, 0.0, 0.0);
    vec3 colorEnd = vec3(1.0, 1.0, 1.0);

    if (radarValue > 0.0 && radarValue < 0.2) {
        rangeEnd = 0.2;
        colorStart = vec3(0.12, 0.85, 0.85);
        colorEnd = vec3(0.0, 0.0, 1.0);
    } else if (radarValue >= 0.2 && radarValue < 0.4) {
        rangeStart = 0.2;
        rangeEnd = 0.33;
        colorStart = vec3(0.05, 0.2, 0.0);
        colorEnd = vec3(0.0, 1.0, 0.0);
    } else if (radarValue >= 0.4 && radarValue < 0.66) {
        rangeStart = 0.4;
        rangeEnd = 0.6;
        colorStart = vec3(1.0, 1.0, 0.0);
        colorEnd = vec3(1.0, 0.5, 0.0);
    } else if (radarValue >= 0.66 && radarValue < 0.93) {
        rangeStart = 0.66;
        rangeEnd = 0.93;
        colorStart = vec3(1.0, 0.0, 0.0);
        colorEnd = vec3(1.0, 0.0, 1.0);
    } else if (radarValue >= 0.93) {
        rangeStart = 0.93;
        rangeEnd = 1.0;
        colorStart = vec3(1.0, 0.0, 1.0);
        colorEnd = vec3(1.0, 1.0, 1.0);
    }

    return mix(colorStart, colorEnd, smoothstep(rangeStart, rangeEnd, radarValue));
}

void main() {
    if (vTexCoord.y <= 0.02) {
        FragColor = vec4(scaleRadarColor(vTexCoord.x), 1.0);
        return;
    }

    // Convert texture coordinates to [-1, 1] for angle calculation
    vec2 uv = vTexCoord * 2.0 - 1.0;

    // Distance from origin [0, 0], i.e. radar gate index
    float distance = length(uv);

    // Angle determines the radar ray index
    float angle = atan(uv.y, uv.x) + (PI / 4.0);
    if (angle < 0.0) {
        angle += 2.0 * PI; // Convert to [0, 2*PI]
    }

    float lineIndex = angle / (2.0 * PI) * uNumLines; // Map angle to line index
    float normalizedLineIndex = lineIndex / uNumLines; // Normalize line index to [0, 1]

    vec2 dataUV = vec2(distance, normalizedLineIndex);
    float radarValue = texture(uTexture, dataUV).r;

    // if (radarValue <= 0.0) discard;
    vec3 radarColor = scaleRadarColor(radarValue);
    FragColor = vec4(radarColor, 1.0);
}
