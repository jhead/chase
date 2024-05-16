import vertexShaderSource from "./vertex.glsl?raw";
import fragmentShaderSource from "./fragment.glsl?raw";
import { QuadVertices, createProgram, createShader } from "./WebGL";

export type RadarOptions = {
  numRays: number;
  numGates: number;
};

const defaultRadarOptions = {
  numRays: 720,
  numGates: 2000,
};

export default class RadarCanvas {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;

  private radarTexture: any;
  private radarData: Float32Array;
  private alive: boolean = true;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly opt: RadarOptions = defaultRadarOptions
  ) {
    const gl = canvas.getContext("webgl2")!;
    if (!gl) {
      throw new Error("WebGL 2 is not available in your browser");
    }

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(
      gl,
      gl.FRAGMENT_SHADER,
      fragmentShaderSource
    );
    const program = createProgram(gl, [vertexShader, fragmentShader]);
    gl.useProgram(program);

    this.gl = gl;
    this.program = program;

    this.radarData = new Float32Array(opt.numRays * opt.numGates);
  }

  initCanvas() {
    this.initQuad();
    this.initRadarTexture();
    this.initUniforms();

    this.render();
  }

  setRadarData(transform: (data: Float32Array) => void) {
    const { gl } = this;

    transform(this.radarData);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.radarTexture);

    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      this.opt.numGates,
      this.opt.numRays,
      gl.RED,
      gl.FLOAT,
      this.radarData
    );
  }

  destroy() {
    this.alive = false;
    clearInterval(this.dataInterval);
  }

  dataInterval: any = -1;

  private render() {
    const { gl } = this;

    const renderLoop = () => {
      if (!this.alive) return;

      gl.clearColor(1.0, 1.0, 1.0, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      requestAnimationFrame(renderLoop);
    };

    renderLoop();
  }

  private initQuad() {
    const { gl, program } = this;
    const vertices = new Float32Array(QuadVertices);

    // Create and bind vertex buffer
    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    // Get attribute location and enable
    const positionLoc = gl.getAttribLocation(program, "aPosition");
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(positionLoc);
  }

  private initRadarTexture() {
    const { gl, program } = this;

    // Gates on x
    // Rays on y

    const radarTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, radarTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R32F,
      this.opt.numGates,
      this.opt.numRays,
      0,
      gl.RED,
      gl.FLOAT,
      this.radarData
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const textureLoc = gl.getUniformLocation(program, "uTexture");
    gl.uniform1i(textureLoc, 0);

    this.radarTexture = radarTexture;
  }

  private initUniforms() {
    const { gl, program, canvas } = this;

    const resolutionLocation = gl.getUniformLocation(program, "uResolution");
    gl.uniform2f(resolutionLocation, canvas.width, canvas.height);

    const numLinesLoc = gl.getUniformLocation(program, "uNumLines");
    gl.uniform1f(numLinesLoc, 720);
  }
}
