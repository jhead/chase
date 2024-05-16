#version 300 es

in vec2 aPosition;
out vec2 vTexCoord;

void main() {
    vTexCoord = (aPosition + 1.0) * 0.5; // Transform to [0, 1] for texture coordinates
    gl_Position = vec4(aPosition, 0.0, 1.0);
}