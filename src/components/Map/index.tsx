import React, { useRef, useEffect } from "react";
import { Coord, Feature, FeatureCollection } from "./types";
import earcut from "earcut";

const size = {
  width: 500,
  height: 500,
};

const geoJsonUrl =
  // "https://raw.githubusercontent.com/johan/world.geo.json/master/countries/USA.geo.json";
  "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json";

export const Map: React.FC = () => {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvas.current) return;

    const { current } = canvas;
    fetchData().then((data) => drawMap(current, data));

    return addListeners(canvas.current);
  }, [canvas]);

  return (
    <>
      <canvas ref={canvas} width={size.width} height={size.height}></canvas>
    </>
  );
};

const defaultZoom = 1; // 6;
const defaultOffset = [0, 0]; // [0.535, -0.42];

let zoom = defaultZoom;
let offset: [number, number] = [...defaultOffset];
let mouseNDC = [0, 0];

const center = () => {
  return [
    (offset[0] + size.width / 2) * zoom,
    (offset[1] + size.height / 2) * zoom,
  ];
};

const addListeners = (canvas: HTMLCanvasElement) => {
  zoom = defaultZoom;
  offset = [...defaultOffset];
  mouseNDC = [0, 0];

  let zoomProgress = 0;

  const onWheel = (ev: WheelEvent) => {
    const rect = canvas.getBoundingClientRect();
    ev.preventDefault();

    trackMouse(ev);

    if (ev.ctrlKey) {
      performZoom(-ev.deltaY / 1000);
    } else {
      offset[0] -= ev.deltaX / rect.width;
      offset[1] += ev.deltaY / rect.height;
      console.log(...offset);
    }
  };

  const performZoom = (zoomFactor: number) => {
    const newZoom = zoom + zoomFactor;

    const [mouseX, mouseY] = mouseNDC;

    const translateX = -mouseX / Math.pow(2, newZoom);
    const translateY = -mouseY / Math.pow(2, newZoom);

    offset[0] += translateX;
    offset[1] += translateY;
    zoom = newZoom;

    console.log({
      zoom: zoom - zoomFactor,
      zoomDivisor: Math.pow(2, newZoom),
      newZoom,
      offset,
      translateX,
      translateY,
      mouseX,
      mouseY,
    });
  };

  const onClick = (ev: MouseEvent) => {
    performZoom(0.5);
  };

  canvas.addEventListener("click", onClick);

  canvas.addEventListener("wheel", onWheel, { passive: false });

  const trackMouse = (ev: WheelEvent | MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = (2 * ev.clientX) / rect.width - 1;
    const mouseY = (-2 * ev.clientY) / rect.height + 1;
    mouseNDC = [mouseX, mouseY];
  };

  const onMouseMove = trackMouse;

  canvas.addEventListener("mousemove", onMouseMove);

  return () => {
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("mousemove", onMouseMove);
    canvas.removeEventListener("click", onClick);
  };
};

const fetchData = async (): Promise<FeatureCollection> => {
  return fetch(geoJsonUrl).then((res) => res.json());
};

// Vertex shader program
const vertexShaderSource = `#version 300 es

uniform vec2 u_resolution;
uniform float zoom;
uniform vec2 offset;
uniform vec2 mouse;

in vec2 a_position;
out vec2 vTexCoord;

void main() {
    vec2 panned = a_position + offset;
    vec2 centered = panned;
    vec2 zoomed = centered * pow(2.0, zoom);
    vec2 final_pos = zoomed;
    gl_Position = vec4(final_pos, 0.0, 1.0);
    vTexCoord = a_position;
}
`;

// Fragment shader program
const fragmentShaderSource = `#version 300 es
precision mediump float;

in vec2 vTexCoord;
out vec4 FragColor;

void main() {
    if (vTexCoord.x >= -1.0 && vTexCoord.x < -0.5) {
      if (vTexCoord.y >= 0.5 || (vTexCoord.y >= -0.5 && vTexCoord.y < 0.0)) {
        FragColor = vec4(1.0, vTexCoord.y, vTexCoord.y, 1.0);
        return;
      }
    }

    if (vTexCoord.x >= 0.0 && vTexCoord.x < 0.5) {
      if (vTexCoord.y >= 0.5 || (vTexCoord.y >= -0.5 && vTexCoord.y < 0.0)) {
        FragColor = vec4(1.0, 1.0, vTexCoord.y, 1.0);
        return;
      }
    }

    if (vTexCoord.x >= -0.5 && vTexCoord.x < 0.0) {
      if ((vTexCoord.y >= 0.0 && vTexCoord.y < 0.5) || vTexCoord.y <= -0.5) {
        FragColor = vec4(1.0, -vTexCoord.y, 1.0, 1.0);
        return;
      }
    }

    if (vTexCoord.x >= 0.5 && vTexCoord.x < 1.0) {
      if ((vTexCoord.y >= 0.0 && vTexCoord.y < 0.5) || vTexCoord.y <= -0.5) {
        FragColor = vec4(-vTexCoord.y, 1.0, 1.0, 1.0);
        return;
      }
    }

    discard;
    FragColor = vec4(1.15, 0.15, 0.15, 1.0); 
}
`;

function createProgram(gl, vertexShader, fragmentShader) {
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  const success = gl.getProgramParameter(program, gl.LINK_STATUS);
  if (success) {
    return program;
  }
  console.log(gl.getProgramInfoLog(program));
  gl.deleteProgram(program);
}

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  if (success) {
    return shader;
  }
  console.log(gl.getShaderInfoLog(shader));
  gl.deleteShader(shader);
}

function initWebGL(canvas): {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
} {
  const gl = canvas.getContext("webgl2");
  if (!gl) {
    console.error("WebGL not supported");
    return;
  }

  // Create shaders
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = createShader(
    gl,
    gl.FRAGMENT_SHADER,
    fragmentShaderSource
  );

  // Create program
  const program = createProgram(gl, vertexShader, fragmentShader);

  return { gl, program };
}

const drawMap = (canvas: HTMLCanvasElement, data: FeatureCollection) => {
  const { gl, program } = initWebGL(canvas);
  gl.useProgram(program);

  const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
  const positionLocation = gl.getAttribLocation(program, "a_position");
  const zoomLocation = gl.getUniformLocation(program, "zoom");
  const offsetLocation = gl.getUniformLocation(program, "offset");
  const mouseLocation = gl.getUniformLocation(program, "mouse");

  const vbo = gl.createBuffer();

  const features = data.features;
  const { coords, indices } = geojsonToCoords(features);

  const quadVertices = [
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
  const buffer = new Float32Array(quadVertices);

  // Bind the position buffer
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, buffer, gl.STATIC_DRAW);

  // Enable the attribute
  gl.enableVertexAttribArray(positionLocation);

  // Tell the attribute how to get data out of vbo (ARRAY_BUFFER)
  const size = 2; // 2 components per iteration
  const type = gl.FLOAT; // the data is 32bit floats
  const normalize = false; // don't normalize the data
  const stride = 0; // 0 = move forward size * sizeof(type) each iteration to get the next position
  gl.vertexAttribPointer(positionLocation, size, type, normalize, stride, 0);

  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array(indices),
    gl.STATIC_DRAW
  );

  // Set the resolution
  gl.uniform2f(resolutionLocation, gl.canvas.width, gl.canvas.height);

  const render = () => {
    gl.uniform1f(zoomLocation, zoom);
    gl.uniform2f(offsetLocation, offset[0], offset[1]);
    gl.uniform2f(mouseLocation, mouseNDC[0], mouseNDC[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    // gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);

    requestAnimationFrame(render);
  };

  render();
};

const normalizeCoords = (coord: Coord): Coord => [
  coord[0] / 180,
  coord[1] / 90,
];

type GeoVertices = {
  coords: number[];
  indices: number[];
};

const geojsonToCoords = (features: Feature[]): GeoVertices => {
  const coords: number[] = [];
  const indices: number[] = [];
  let currentIndex = 0;

  features.forEach((feature) => {
    const geom = feature.geometry;
    const polygons =
      geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;

    polygons.forEach((poly) => {
      const { vertices, holes, dimensions } = earcut.flatten(poly);

      const newIndices = earcut(vertices, holes, dimensions).map(
        (i) => currentIndex + i
      );

      const normalizedCoords = poly.flat().map(normalizeCoords).flat();

      indices.push(...newIndices);
      coords.push(...normalizedCoords);
      currentIndex = coords.length / 2 - 1;
    });
  });

  return { coords, indices };
};
