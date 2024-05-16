export type ShaderType =
  | WebGL2RenderingContext["VERTEX_SHADER"]
  | WebGL2RenderingContext["FRAGMENT_SHADER"];

export const QuadVertices = [
  -1.0,
  -1.0, // Bottom-left
  1.0,
  -1.0, // Bottom-right
  -1.0,
  1.0, // Top-left
  1.0,
  -1.0, // Bottom-right
  1.0,
  1.0, // Top-right
  -1.0,
  1.0, // Top-left
];

export const createShader = (
  gl: WebGL2RenderingContext,
  type: ShaderType,
  source: string
): WebGLShader => {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const msg = "Shader compile failed with: " + gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(msg);
  }
  return shader;
};

export const createProgram = (
  gl: WebGLRenderingContext,
  shaders: WebGLShader[]
): WebGLProgram => {
  const program = gl.createProgram()!;
  shaders.forEach((shader) => {
    gl.attachShader(program, shader);
  });
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(
      "Program linking failed with: " + gl.getProgramInfoLog(program)
    );
  }
  return program;
};
