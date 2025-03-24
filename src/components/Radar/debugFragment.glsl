#version 300 es

precision mediump float;

in vec2 vTexCoord;
out vec4 FragColor;

uniform vec2 uResolution;
uniform sampler2D uTexture;
uniform float uNumLines;

void main() {
  FragColor = texture(uTexture, vTexCoord);
}
