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

    if (radarValue  > 0.0 && radarValue < 0.2) {
        rangeEnd = 0.2;
        colorStart = vec3(0.0, 0.0, 0.0);
        colorEnd = vec3(0.2, 0.48, 0.55);
    } else if (radarValue >= 0.2 && radarValue < 0.4) {
        rangeStart = 0.2;
        rangeEnd = 0.4;
        colorStart = vec3(.15, .63, .2); // 40, 160, 50
        colorEnd = vec3(0.07, .25, 0.04); 
    } else if (radarValue >= 0.4 && radarValue < 0.66) {
        rangeStart = 0.4;
        rangeEnd = 0.6;
        colorStart = vec3(1.0, 1.0, 0.0);
        colorEnd = vec3(1.0, 0.5, 0.0);
    } else if (radarValue >= 0.66 && radarValue < 0.8) {
        rangeStart = 0.66;
        rangeEnd = 0.8;
        colorStart = vec3(1.0, 0.0, 0.0);
        colorEnd = vec3(0.37, 0.08, 0.08);// 95, 20, 20
    } else if (radarValue >= 0.8) {
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

    // Convert texture coordinates to [-1, 1] for angle calculation
    vec2 uv = vTexCoord * 2.0 - 1.0;
    uv = uv * vec2(-1.0, 1.0);

    // Distance from origin [0, 0], i.e. radar gate index
    float distance = length(uv);

    // Angle determines the radar ray index
    float angle = atan(uv.y, uv.x) - (2.0 * PI / 4.0);
    if (angle < 0.0) {
        angle += 2.0 * PI; // Convert to [0, 2*PI]
    }

    float lineIndex = uNumLines * angle / (2.0 * PI); // Map angle to line index
    float normalizedLineIndex = lineIndex / uNumLines; // Normalize line index to [0, 1]

    vec2 dataUV = vec2(distance, normalizedLineIndex);
    float radarValue = texture(uTexture, dataUV).r;

    // if (radarValue <= 0.0) discard;
    vec3 radarColor = scaleRadarColor(radarValue);
    FragColor = vec4(radarColor, 1.0);
}
