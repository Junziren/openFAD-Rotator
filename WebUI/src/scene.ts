import { mat3, mat4, vec3 } from "gl-matrix";

export type AudioFrame = {
  low: number;
  mid: number;
  high: number;
  peak: number;
};

export type SceneControls = {
  rotorRate: number;
  direction: 1 | -1;
  rotatorAmount: number;
  dopplerAmount: number;
  motion: number;
  depth: number;
  reducedMotion: boolean;
};

export type Telemetry = {
  rotorPhase?: number;
  rotorRate?: number;
  rotorSignedRate?: number;
  direction?: number;
  audioSequence?: number;
  inputPeak?: number;
  outputPeak?: number;
  bands?: number[];
  playing?: boolean;
};

type MeshData = {
  positions: number[];
  normals: number[];
  indices: number[];
};

type ShellSurfaces = {
  exterior: MeshData;
  interior: MeshData;
  edges: MeshData;
};

type GpuMesh = {
  vao: WebGLVertexArrayObject;
  buffers: WebGLBuffer[];
  indexCount: number;
};

type RenderTarget = {
  sceneFramebuffer: WebGLFramebuffer;
  colorBuffer: WebGLRenderbuffer;
  depthBuffer: WebGLRenderbuffer;
  resolveFramebuffer: WebGLFramebuffer;
  colorTexture: WebGLTexture;
  bloomFramebuffers: [WebGLFramebuffer, WebGLFramebuffer];
  bloomTextures: [WebGLTexture, WebGLTexture];
};

type MainUniforms = {
  projection: WebGLUniformLocation | null;
  view: WebGLUniformLocation | null;
  model: WebGLUniformLocation | null;
  normalMatrix: WebGLUniformLocation | null;
  color: WebGLUniformLocation | null;
  opacity: WebGLUniformLocation | null;
  emission: WebGLUniformLocation | null;
  ambient: WebGLUniformLocation | null;
  lightDirection: WebGLUniformLocation | null;
};

type ParticleUniforms = {
  projection: WebGLUniformLocation | null;
  view: WebGLUniformLocation | null;
  pointScale: WebGLUniformLocation | null;
  lowColor: WebGLUniformLocation | null;
  midColor: WebGLUniformLocation | null;
  highColor: WebGLUniformLocation | null;
  opacity: WebGLUniformLocation | null;
  glow: WebGLUniformLocation | null;
  trailMode: WebGLUniformLocation | null;
};

type BrightUniforms = { scene: WebGLUniformLocation | null };
type BlurUniforms = {
  source: WebGLUniformLocation | null;
  direction: WebGLUniformLocation | null;
};
type PostUniforms = {
  scene: WebGLUniformLocation | null;
  bloom: WebGLUniformLocation | null;
  texelSize: WebGLUniformLocation | null;
  outlineStrength: WebGLUniformLocation | null;
  glowStrength: WebGLUniformLocation | null;
};

type Palette = {
  paper: vec3;
  chrome: vec3;
  ink: vec3;
  inkSoft: vec3;
  indigo: vec3;
  pine: vec3;
  brass: vec3;
  rust: vec3;
  shadow: vec3;
  screen: vec3;
};

const palette: Palette = {
  paper: vec3.fromValues(0.64, 0.63, 0.77),
  chrome: vec3.fromValues(0.80, 0.76, 0.72),
  ink: vec3.fromValues(0.040, 0.035, 0.075),
  inkSoft: vec3.fromValues(0.15, 0.14, 0.24),
  indigo: vec3.fromValues(0.46, 0.43, 0.64),
  pine: vec3.fromValues(0.39, 0.53, 0.55),
  brass: vec3.fromValues(0.82, 0.62, 0.42),
  rust: vec3.fromValues(0.66, 0.42, 0.52),
  shadow: vec3.fromValues(0.080, 0.070, 0.15),
  screen: vec3.fromValues(0.055, 0.046, 0.090),
};

const hornGeometry = {
  rootOffset: 0.28,
  length: 1.40,
  lipDepth: 0.07,
  mouthRadius: 0.62,
  lipOuterRadius: 0.65,
  maxSpread: 1.10,
};

const drumGeometry = {
  radius: 1.15,
  height: 1.30,
  scoopWidth: 1.24,
  scoopReach: 1.57,
};

const cabinetGeometry = {
  innerHalfWidth: 2.33,
  innerHalfDepth: 2.18,
  wallThickness: 0.18,
  floorHalfDepth: 2.36,
};

const vertexSource = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
uniform mat4 uProjection;
uniform mat4 uView;
uniform mat4 uModel;
uniform mat3 uNormalMatrix;
out vec3 vNormal;
out vec3 vWorldPosition;
void main() {
  vec4 world = uModel * vec4(aPosition, 1.0);
  vWorldPosition = world.xyz;
  vNormal = normalize(uNormalMatrix * aNormal);
  gl_Position = uProjection * uView * world;
}`;

const fragmentSource = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vWorldPosition;
uniform vec3 uColor;
uniform vec3 uLightDirection;
uniform float uAmbient;
uniform float uEmission;
uniform float uOpacity;
out vec4 outColor;
void main() {
  vec3 normal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
  if (!gl_FrontFacing) normal = -normal;
  float key = max(dot(normal, normalize(uLightDirection)), 0.0);
  float fill = max(dot(normal, normalize(vec3(-0.62, 0.28, 0.48))), 0.0) * 0.22;
  float rim = pow(1.0 - max(dot(normal, normalize(vec3(5.8, 3.6, 8.5) - vWorldPosition)), 0.0), 2.0);
  float rawLight = uAmbient + key * 0.68 + fill;
  float lowerStep = floor(rawLight * 4.0) / 4.0;
  float steppedLight = mix(lowerStep, lowerStep + 0.25, smoothstep(0.34, 0.72, fract(rawLight * 4.0)));
  float lightLevel = max(0.50, steppedLight);
  float baseLuma = dot(uColor, vec3(0.299, 0.587, 0.114));
  vec3 duskNeutral = vec3(baseLuma) * vec3(0.93, 0.90, 1.04);
  vec3 baseColor = mix(uColor, duskNeutral, 0.14);
  float heightMix = smoothstep(-1.8, 2.2, vWorldPosition.y);
  vec3 atmosphere = mix(vec3(0.030, 0.028, 0.070), vec3(0.070, 0.046, 0.036), heightMix);
  vec3 lit = baseColor * lightLevel
    + atmosphere * (0.18 + (1.0 - lightLevel) * 0.30)
    + baseColor * (uEmission + rim * 0.026);
  outColor = vec4(lit, uOpacity);
}`;

const particleVertexSource = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
layout(location = 1) in float aEnergy;
layout(location = 2) in float aSize;
layout(location = 3) in float aBand;
uniform mat4 uProjection;
uniform mat4 uView;
uniform float uPointScale;
out float vEnergy;
out float vBand;
void main() {
  gl_Position = uProjection * uView * vec4(aPosition, 1.0);
  gl_PointSize = clamp(aSize * uPointScale, 1.75, 10.0);
  vEnergy = aEnergy;
  vBand = aBand;
}`;

const particleFragmentSource = `#version 300 es
precision highp float;
in float vEnergy;
in float vBand;
uniform vec3 uLowColor;
uniform vec3 uMidColor;
uniform vec3 uHighColor;
uniform float uOpacity;
uniform float uGlow;
uniform float uTrailMode;
out vec4 outColor;
void main() {
  vec3 color = vBand < 0.5 ? uHighColor : (vBand < 1.5 ? uLowColor : uMidColor);
  if (uTrailMode > 0.5) {
    outColor = vec4(color * (0.74 + uGlow), vEnergy * uOpacity);
    return;
  }
  vec2 point = gl_PointCoord * 2.0 - 1.0;
  float radius = length(point);
  if (radius > 1.0) discard;
  float softEdge = 1.0 - smoothstep(0.30, 1.0, radius);
  float core = 1.0 - smoothstep(0.0, 0.30, radius);
  color *= 0.72 + core * 0.42 + uGlow;
  float alpha = softEdge * vEnergy * uOpacity;
  outColor = vec4(color, alpha);
}`;

const postVertexSource = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 position = gl_VertexID == 0 ? vec2(-1.0, -1.0) : (gl_VertexID == 1 ? vec2(3.0, -1.0) : vec2(-1.0, 3.0));
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const brightFragmentSource = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 outColor;
float luminance(vec3 color) {
  return dot(color, vec3(0.299, 0.587, 0.114));
}
void main() {
  vec3 color = texture(uScene, vUv).rgb;
  float brightness = luminance(color);
  float threshold = smoothstep(0.44, 0.86, brightness);
  float saturation = max(max(color.r, color.g), color.b) - min(min(color.r, color.g), color.b);
  outColor = vec4(color * threshold * (0.68 + saturation * 0.22), 1.0);
}`;

const blurFragmentSource = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSource;
uniform vec2 uDirection;
out vec4 outColor;
void main() {
  vec3 color = texture(uSource, vUv).rgb * 0.227027;
  color += texture(uSource, vUv + uDirection * 1.384615).rgb * 0.316216;
  color += texture(uSource, vUv - uDirection * 1.384615).rgb * 0.316216;
  color += texture(uSource, vUv + uDirection * 3.230769).rgb * 0.070270;
  color += texture(uSource, vUv - uDirection * 3.230769).rgb * 0.070270;
  outColor = vec4(color, 1.0);
}`;

const postFragmentSource = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2 uTexelSize;
uniform float uOutlineStrength;
uniform float uGlowStrength;
out vec4 outColor;
float luminance(vec3 color) {
  return dot(color, vec3(0.299, 0.587, 0.114));
}
void main() {
  vec3 clearTone = vec3(0.055, 0.046, 0.090);
  vec3 center = texture(uScene, vUv).rgb;
  float backgroundMask = 1.0 - smoothstep(0.003, 0.030, length(center - clearTone));
  vec3 backgroundTone = mix(
    vec3(0.082, 0.066, 0.128),
    vec3(0.039, 0.033, 0.074),
    smoothstep(0.04, 0.96, vUv.y)
  );
  center = mix(center, backgroundTone, backgroundMask);
  vec3 left = texture(uScene, vUv - vec2(uTexelSize.x, 0.0)).rgb;
  vec3 right = texture(uScene, vUv + vec2(uTexelSize.x, 0.0)).rgb;
  vec3 bottom = texture(uScene, vUv - vec2(0.0, uTexelSize.y)).rgb;
  vec3 top = texture(uScene, vUv + vec2(0.0, uTexelSize.y)).rgb;
  float luminanceEdge = length(vec2(luminance(right) - luminance(left), luminance(top) - luminance(bottom)));
  float colorEdge = (length(right - left) + length(top - bottom)) * 0.32;
  float edge = smoothstep(0.10, 0.52, luminanceEdge + colorEdge);
  vec3 glow = texture(uBloom, vUv).rgb;

  float centerLuma = luminance(center);
  vec3 shadowTone = vec3(0.94, 0.91, 1.08);
  vec3 highlightTone = vec3(1.06, 0.98, 0.89);
  vec3 graded = center * mix(shadowTone, highlightTone, smoothstep(0.14, 0.72, centerLuma));
  graded = mix(vec3(luminance(graded)), graded, 0.84);

  vec3 verticalTone = mix(vec3(0.94, 0.91, 1.07), vec3(1.05, 0.97, 0.89), smoothstep(0.08, 0.92, vUv.y));
  graded *= mix(vec3(1.0), verticalTone, 0.12);

  float warmGlow = smoothstep(-0.02, 0.22, glow.r - glow.b);
  vec3 glowTint = mix(vec3(0.78, 0.76, 1.06), vec3(1.08, 0.88, 0.70), warmGlow);
  graded += glow * glowTint * uGlowStrength;
  graded += vec3(0.013, 0.011, 0.030) * (1.0 - abs(vUv.y * 2.0 - 1.0));

  vec3 outline = vec3(0.040, 0.034, 0.072);
  float outlineMask = edge * (1.0 - smoothstep(0.48, 0.88, centerLuma));
  graded = mix(graded, outline, outlineMask * uOutlineStrength);
  graded /= 1.0 + max(graded - vec3(0.82), vec3(0.0)) * 0.72;
  float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  graded += (grain - 0.5) * 0.0024;
  outColor = vec4(graded, 1.0);
}`;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function createShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to create WebGL shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || "Unknown shader error";
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext, vertexCode = vertexSource, fragmentCode = fragmentSource) {
  const vertex = createShader(gl, gl.VERTEX_SHADER, vertexCode);
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, fragmentCode);
  const program = gl.createProgram();
  if (!program) throw new Error("Unable to create WebGL program");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) || "Unknown program link error";
    gl.deleteProgram(program);
    throw new Error(log);
  }
  return program;
}

function createRenderTarget(gl: WebGL2RenderingContext): RenderTarget {
  const sceneFramebuffer = gl.createFramebuffer();
  const colorBuffer = gl.createRenderbuffer();
  const depthBuffer = gl.createRenderbuffer();
  const resolveFramebuffer = gl.createFramebuffer();
  const colorTexture = gl.createTexture();
  const bloomFramebufferA = gl.createFramebuffer();
  const bloomFramebufferB = gl.createFramebuffer();
  const bloomTextureA = gl.createTexture();
  const bloomTextureB = gl.createTexture();
  if (
    !sceneFramebuffer || !colorBuffer || !depthBuffer || !resolveFramebuffer || !colorTexture
    || !bloomFramebufferA || !bloomFramebufferB || !bloomTextureA || !bloomTextureB
  ) {
    throw new Error("Unable to allocate WebGL render target");
  }
  for (const texture of [colorTexture, bloomTextureA, bloomTextureB]) {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  gl.bindTexture(gl.TEXTURE_2D, null);
  return {
    sceneFramebuffer,
    colorBuffer,
    depthBuffer,
    resolveFramebuffer,
    colorTexture,
    bloomFramebuffers: [bloomFramebufferA, bloomFramebufferB],
    bloomTextures: [bloomTextureA, bloomTextureB],
  };
}

function resizeRenderTarget(gl: WebGL2RenderingContext, target: RenderTarget, width: number, height: number) {
  const sampleCount = Math.max(1, Math.min(4, gl.getParameter(gl.MAX_SAMPLES) as number));
  gl.bindRenderbuffer(gl.RENDERBUFFER, target.colorBuffer);
  gl.renderbufferStorageMultisample(gl.RENDERBUFFER, sampleCount, gl.RGBA8, width, height);
  gl.bindRenderbuffer(gl.RENDERBUFFER, target.depthBuffer);
  gl.renderbufferStorageMultisample(gl.RENDERBUFFER, sampleCount, gl.DEPTH_COMPONENT16, width, height);

  gl.bindFramebuffer(gl.FRAMEBUFFER, target.sceneFramebuffer);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, target.colorBuffer);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, target.depthBuffer);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error("Multisample framebuffer is incomplete");
  }

  gl.bindTexture(gl.TEXTURE_2D, target.colorTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.resolveFramebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.colorTexture, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error("Resolve framebuffer is incomplete");
  }

  const bloomWidth = Math.max(1, Math.floor(width / 2));
  const bloomHeight = Math.max(1, Math.floor(height / 2));
  target.bloomTextures.forEach((texture, index) => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, bloomWidth, bloomHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.bloomFramebuffers[index]);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`Bloom framebuffer ${index} is incomplete`);
    }
  });

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

function createBox(width = 1, height = 1, depth = 1): MeshData {
  const x = width / 2;
  const y = height / 2;
  const z = depth / 2;
  const positions = [
    -x, -y, z, x, -y, z, x, y, z, -x, y, z,
    x, -y, -z, -x, -y, -z, -x, y, -z, x, y, -z,
    -x, y, z, x, y, z, x, y, -z, -x, y, -z,
    -x, -y, -z, x, -y, -z, x, -y, z, -x, -y, z,
    x, -y, z, x, -y, -z, x, y, -z, x, y, z,
    -x, -y, -z, -x, -y, z, -x, y, z, -x, y, -z,
  ];
  const normals = [
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
    0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
    1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
    -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
  ];
  const indices: number[] = [];
  for (let face = 0; face < 6; face += 1) {
    const offset = face * 4;
    indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
  }
  return { positions, normals, indices };
}

function createCylinder(radius = 1, height = 1, segments = 32): MeshData {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const half = height / 2;

  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    positions.push(x, -half, z, x, half, z);
    normals.push(Math.cos(angle), 0, Math.sin(angle), Math.cos(angle), 0, Math.sin(angle));
  }
  for (let index = 0; index < segments; index += 1) {
    const base = index * 2;
    indices.push(base, base + 1, base + 3, base, base + 3, base + 2);
  }

  const bottomCenter = positions.length / 3;
  positions.push(0, -half, 0);
  normals.push(0, -1, 0);
  const topCenter = positions.length / 3;
  positions.push(0, half, 0);
  normals.push(0, 1, 0);
  const bottomRing = positions.length / 3;
  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    positions.push(Math.cos(angle) * radius, -half, Math.sin(angle) * radius);
    normals.push(0, -1, 0);
  }
  const topRing = positions.length / 3;
  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    positions.push(Math.cos(angle) * radius, half, Math.sin(angle) * radius);
    normals.push(0, 1, 0);
  }
  for (let index = 0; index < segments; index += 1) {
    indices.push(bottomCenter, bottomRing + index + 1, bottomRing + index);
    indices.push(topCenter, topRing + index, topRing + index + 1);
  }
  return { positions, normals, indices };
}

function pushQuad(data: MeshData, a: vec3, b: vec3, c: vec3, d: vec3) {
  const base = data.positions.length / 3;
  for (const point of [a, b, c, d]) {
    data.positions.push(point[0], point[1], point[2]);
    data.normals.push(0, 1, 0);
  }
  data.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function createShellSurfaces(): ShellSurfaces {
  const mesh = (): MeshData => ({ positions: [], normals: [], indices: [] });
  return { exterior: mesh(), interior: mesh(), edges: mesh() };
}

function createPanelShell(width = 1, height = 1, thickness = 1): ShellSurfaces {
  const surfaces = createShellSurfaces();
  const x = width / 2;
  const y = height / 2;
  const z = thickness / 2;

  pushQuad(
    surfaces.exterior,
    vec3.fromValues(-x, -y, z),
    vec3.fromValues(x, -y, z),
    vec3.fromValues(x, y, z),
    vec3.fromValues(-x, y, z),
  );
  pushQuad(
    surfaces.interior,
    vec3.fromValues(x, -y, -z),
    vec3.fromValues(-x, -y, -z),
    vec3.fromValues(-x, y, -z),
    vec3.fromValues(x, y, -z),
  );
  pushQuad(
    surfaces.edges,
    vec3.fromValues(-x, y, z),
    vec3.fromValues(x, y, z),
    vec3.fromValues(x, y, -z),
    vec3.fromValues(-x, y, -z),
  );
  pushQuad(
    surfaces.edges,
    vec3.fromValues(x, -y, z),
    vec3.fromValues(-x, -y, z),
    vec3.fromValues(-x, -y, -z),
    vec3.fromValues(x, -y, -z),
  );
  pushQuad(
    surfaces.edges,
    vec3.fromValues(x, -y, z),
    vec3.fromValues(x, -y, -z),
    vec3.fromValues(x, y, -z),
    vec3.fromValues(x, y, z),
  );
  pushQuad(
    surfaces.edges,
    vec3.fromValues(-x, -y, -z),
    vec3.fromValues(-x, -y, z),
    vec3.fromValues(-x, y, z),
    vec3.fromValues(-x, y, -z),
  );
  return surfaces;
}

function mergeSurfaces(surfaces: ShellSurfaces): MeshData {
  const merged: MeshData = { positions: [], normals: [], indices: [] };
  for (const surface of [surfaces.exterior, surfaces.interior, surfaces.edges]) {
    const offset = merged.positions.length / 3;
    merged.positions.push(...surface.positions);
    merged.normals.push(...surface.normals);
    merged.indices.push(...surface.indices.map((index) => index + offset));
  }
  return merged;
}

function validateMesh(name: string, data: MeshData) {
  const vertexCount = data.positions.length / 3;
  if (data.positions.length % 3 !== 0 || data.normals.length !== data.positions.length || data.indices.length % 3 !== 0) {
    throw new Error(`${name} contains malformed vertex data`);
  }
  if (!data.positions.every(Number.isFinite) || !data.indices.every((index) => Number.isInteger(index) && index >= 0 && index < vertexCount)) {
    throw new Error(`${name} contains invalid geometry values`);
  }
}

function validateClosedMesh(name: string, data: MeshData) {
  validateMesh(name, data);
  const pointKey = (index: number) => {
    const base = index * 3;
    return `${Math.round(data.positions[base] * 100000)},${Math.round(data.positions[base + 1] * 100000)},${Math.round(data.positions[base + 2] * 100000)}`;
  };
  const edges = new Map<string, number>();
  for (let index = 0; index < data.indices.length; index += 3) {
    const triangle = [data.indices[index], data.indices[index + 1], data.indices[index + 2]];
    for (const [from, to] of [[triangle[0], triangle[1]], [triangle[1], triangle[2]], [triangle[2], triangle[0]]]) {
      const a = pointKey(from);
      const b = pointKey(to);
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  const invalidEdges = Array.from(edges.values()).filter((count) => count !== 2).length;
  if (invalidEdges > 0) throw new Error(`${name} is not closed (${invalidEdges} boundary edges)`);
}

function validateClosedShell(name: string, surfaces: ShellSurfaces) {
  validateClosedMesh(name, mergeSurfaces(surfaces));
}

function validateRotorClearance() {
  const axialReach = hornGeometry.rootOffset
    + (hornGeometry.length + hornGeometry.lipDepth) * hornGeometry.maxSpread;
  const sweptRadius = Math.hypot(axialReach, hornGeometry.lipOuterRadius);
  const availableRadius = Math.min(cabinetGeometry.innerHalfWidth, cabinetGeometry.innerHalfDepth);
  const clearance = availableRadius - sweptRadius;
  if (clearance < 0.08) {
    throw new Error(`Horn sweep clearance is too small (${clearance.toFixed(3)})`);
  }
  const scoopSweptRadius = Math.hypot(drumGeometry.scoopWidth / 2, drumGeometry.scoopReach);
  const drumClearance = availableRadius - scoopSweptRadius;
  if (drumClearance < 0.08) {
    throw new Error(`Drum scoop sweep clearance is too small (${drumClearance.toFixed(3)})`);
  }
}

function createHornShell(
  length = hornGeometry.length,
  throatRadius = 0.14,
  mouthRadius = hornGeometry.mouthRadius,
  radialSegments = 12,
  lengthSegments = 4,
): ShellSurfaces {
  const surfaces = createShellSurfaces();
  const thickness = 0.09;
  const radiusAt = (t: number) => {
    const smooth = t * t * (3 - 2 * t);
    return throatRadius + (mouthRadius - throatRadius) * smooth;
  };
  const point = (t: number, angle: number, inset = 0) => {
    const radius = Math.max(0.045, radiusAt(t) - inset);
    return vec3.fromValues(t * length, Math.cos(angle) * radius, Math.sin(angle) * radius);
  };

  for (let section = 0; section < lengthSegments; section += 1) {
    const t0 = section / lengthSegments;
    const t1 = (section + 1) / lengthSegments;
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const a0 = (segment / radialSegments) * Math.PI * 2;
      const a1 = ((segment + 1) / radialSegments) * Math.PI * 2;
      pushQuad(surfaces.exterior, point(t0, a0), point(t1, a0), point(t1, a1), point(t0, a1));
      pushQuad(surfaces.interior, point(t0, a1, thickness), point(t1, a1, thickness), point(t1, a0, thickness), point(t0, a0, thickness));
    }
  }

  for (let segment = 0; segment < radialSegments; segment += 1) {
    const a0 = (segment / radialSegments) * Math.PI * 2;
    const a1 = ((segment + 1) / radialSegments) * Math.PI * 2;
    const lipDepth = hornGeometry.lipDepth;
    const lipOuterRadius = hornGeometry.lipOuterRadius;
    const lipInnerRadius = Math.max(0.045, mouthRadius - thickness * 0.52);
    const lipPoint = (angle: number, radius: number, x: number) => vec3.fromValues(
      x,
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
    );
    const hornOuter0 = point(1, a0);
    const hornOuter1 = point(1, a1);
    const hornInner0 = point(1, a0, thickness);
    const hornInner1 = point(1, a1, thickness);
    const outerBack0 = lipPoint(a0, lipOuterRadius, length);
    const outerBack1 = lipPoint(a1, lipOuterRadius, length);
    const outerFront0 = lipPoint(a0, lipOuterRadius, length + lipDepth);
    const outerFront1 = lipPoint(a1, lipOuterRadius, length + lipDepth);
    const innerBack0 = lipPoint(a0, lipInnerRadius, length);
    const innerBack1 = lipPoint(a1, lipInnerRadius, length);
    const innerFront0 = lipPoint(a0, lipInnerRadius, length + lipDepth);
    const innerFront1 = lipPoint(a1, lipInnerRadius, length + lipDepth);

    pushQuad(surfaces.edges, hornOuter0, outerBack0, outerBack1, hornOuter1);
    pushQuad(surfaces.edges, outerBack0, outerFront0, outerFront1, outerBack1);
    pushQuad(surfaces.edges, outerFront0, innerFront0, innerFront1, outerFront1);
    pushQuad(surfaces.edges, innerFront0, innerBack0, innerBack1, innerFront1);
    pushQuad(surfaces.edges, innerBack0, hornInner0, hornInner1, innerBack1);
    pushQuad(surfaces.edges, point(0, a1), point(0, a0), point(0, a0, thickness), point(0, a1, thickness));
  }
  return surfaces;
}

function createDrumShell(radius = drumGeometry.radius, height = drumGeometry.height, segments = 20): ShellSurfaces {
  const surfaces = createShellSurfaces();
  const innerRadius = radius - 0.12;
  const halfHeight = height / 2;
  const portCenter = Math.PI / 2;
  const portHalfArc = 0.58;
  const portBottom = -0.30;
  const portTop = 0.36;
  const portStart = portCenter - portHalfArc;
  const portEnd = portCenter + portHalfArc;
  const point = (angle: number, y: number, shellRadius: number) => vec3.fromValues(
    Math.cos(angle) * shellRadius,
    y,
    Math.sin(angle) * shellRadius,
  );
  const angles = Array.from({ length: segments }, (_, index) => (index / segments) * Math.PI * 2)
    .concat(portStart, portEnd, Math.PI * 2)
    .sort((a, b) => a - b)
    .filter((angle, index, values) => index === 0 || Math.abs(angle - values[index - 1]) > 0.0001);

  for (let index = 0; index < angles.length - 1; index += 1) {
    const a0 = angles[index];
    const a1 = angles[index + 1];
    const middle = (a0 + a1) * 0.5;
    const insidePort = middle > portStart && middle < portEnd;

    if (insidePort) {
      pushQuad(surfaces.exterior, point(a0, -halfHeight, radius), point(a1, -halfHeight, radius), point(a1, portBottom, radius), point(a0, portBottom, radius));
      pushQuad(surfaces.exterior, point(a0, portTop, radius), point(a1, portTop, radius), point(a1, halfHeight, radius), point(a0, halfHeight, radius));
      pushQuad(surfaces.interior, point(a1, -halfHeight, innerRadius), point(a0, -halfHeight, innerRadius), point(a0, portBottom, innerRadius), point(a1, portBottom, innerRadius));
      pushQuad(surfaces.interior, point(a1, portTop, innerRadius), point(a0, portTop, innerRadius), point(a0, halfHeight, innerRadius), point(a1, halfHeight, innerRadius));
      pushQuad(surfaces.edges, point(a0, portBottom, radius), point(a1, portBottom, radius), point(a1, portBottom, innerRadius), point(a0, portBottom, innerRadius));
      pushQuad(surfaces.edges, point(a1, portTop, radius), point(a0, portTop, radius), point(a0, portTop, innerRadius), point(a1, portTop, innerRadius));
    } else {
      for (const [y0, y1] of [[-halfHeight, portBottom], [portBottom, portTop], [portTop, halfHeight]]) {
        pushQuad(surfaces.exterior, point(a0, y0, radius), point(a1, y0, radius), point(a1, y1, radius), point(a0, y1, radius));
        pushQuad(surfaces.interior, point(a1, y0, innerRadius), point(a0, y0, innerRadius), point(a0, y1, innerRadius), point(a1, y1, innerRadius));
      }
    }

    pushQuad(surfaces.edges, point(a0, halfHeight, radius), point(a1, halfHeight, radius), point(a1, halfHeight, innerRadius), point(a0, halfHeight, innerRadius));
    pushQuad(surfaces.edges, point(a1, -halfHeight, radius), point(a0, -halfHeight, radius), point(a0, -halfHeight, innerRadius), point(a1, -halfHeight, innerRadius));
  }

  for (const edge of [portStart, portEnd]) {
    pushQuad(surfaces.edges, point(edge, portBottom, radius), point(edge, portTop, radius), point(edge, portTop, innerRadius), point(edge, portBottom, innerRadius));
  }
  return surfaces;
}

function createDrumScoop(): MeshData {
  const data: MeshData = { positions: [], normals: [], indices: [] };
  const backLeftTop = vec3.fromValues(-0.58, 0.05, -0.10);
  const backRightTop = vec3.fromValues(0.58, 0.05, -0.10);
  const backLeftBottom = vec3.fromValues(-0.58, -0.01, -0.10);
  const backRightBottom = vec3.fromValues(0.58, -0.01, -0.10);
  const frontLeftTop = vec3.fromValues(-0.62, -0.04, 0.42);
  const frontRightTop = vec3.fromValues(0.62, -0.04, 0.42);
  const frontLeftBottom = vec3.fromValues(-0.62, -0.10, 0.42);
  const frontRightBottom = vec3.fromValues(0.62, -0.10, 0.42);

  pushQuad(data, backLeftTop, frontLeftTop, frontRightTop, backRightTop);
  pushQuad(data, backRightBottom, frontRightBottom, frontLeftBottom, backLeftBottom);
  pushQuad(data, backLeftBottom, frontLeftBottom, frontLeftTop, backLeftTop);
  pushQuad(data, backRightTop, frontRightTop, frontRightBottom, backRightBottom);
  pushQuad(data, backRightTop, backRightBottom, backLeftBottom, backLeftTop);
  pushQuad(data, frontLeftTop, frontLeftBottom, frontRightBottom, frontRightTop);
  return data;
}

function createAnnularCylinder(outerRadius = 1, innerRadius = 0.32, height = 0.08, segments = 16): MeshData {
  const data: MeshData = { positions: [], normals: [], indices: [] };
  const halfHeight = height / 2;
  const point = (angle: number, y: number, radius: number) => vec3.fromValues(
    Math.cos(angle) * radius,
    y,
    Math.sin(angle) * radius,
  );
  for (let segment = 0; segment < segments; segment += 1) {
    const a0 = (segment / segments) * Math.PI * 2;
    const a1 = ((segment + 1) / segments) * Math.PI * 2;
    pushQuad(data, point(a0, -halfHeight, outerRadius), point(a1, -halfHeight, outerRadius), point(a1, halfHeight, outerRadius), point(a0, halfHeight, outerRadius));
    pushQuad(data, point(a1, -halfHeight, innerRadius), point(a0, -halfHeight, innerRadius), point(a0, halfHeight, innerRadius), point(a1, halfHeight, innerRadius));
    pushQuad(data, point(a0, halfHeight, outerRadius), point(a1, halfHeight, outerRadius), point(a1, halfHeight, innerRadius), point(a0, halfHeight, innerRadius));
    pushQuad(data, point(a1, -halfHeight, outerRadius), point(a0, -halfHeight, outerRadius), point(a0, -halfHeight, innerRadius), point(a1, -halfHeight, innerRadius));
  }
  return data;
}

function createAnnularFrustum(
  bottomOuterRadius = 0.42,
  topOuterRadius = 0.60,
  bottomInnerRadius = 0.28,
  topInnerRadius = 0.46,
  height = 0.30,
  segments = 12,
): ShellSurfaces {
  const surfaces = createShellSurfaces();
  const halfHeight = height / 2;
  const point = (angle: number, y: number, radius: number) => vec3.fromValues(
    Math.cos(angle) * radius,
    y,
    Math.sin(angle) * radius,
  );

  for (let segment = 0; segment < segments; segment += 1) {
    const a0 = (segment / segments) * Math.PI * 2;
    const a1 = ((segment + 1) / segments) * Math.PI * 2;
    const bottomOuter0 = point(a0, -halfHeight, bottomOuterRadius);
    const bottomOuter1 = point(a1, -halfHeight, bottomOuterRadius);
    const topOuter0 = point(a0, halfHeight, topOuterRadius);
    const topOuter1 = point(a1, halfHeight, topOuterRadius);
    const bottomInner0 = point(a0, -halfHeight, bottomInnerRadius);
    const bottomInner1 = point(a1, -halfHeight, bottomInnerRadius);
    const topInner0 = point(a0, halfHeight, topInnerRadius);
    const topInner1 = point(a1, halfHeight, topInnerRadius);

    pushQuad(surfaces.exterior, bottomOuter0, bottomOuter1, topOuter1, topOuter0);
    pushQuad(surfaces.interior, bottomInner1, bottomInner0, topInner0, topInner1);
    pushQuad(surfaces.edges, topOuter0, topOuter1, topInner1, topInner0);
    pushQuad(surfaces.edges, bottomOuter1, bottomOuter0, bottomInner0, bottomInner1);
  }
  return surfaces;
}

function createTaperedDecal(): MeshData {
  return {
    positions: [
      0, -0.16, 0,
      1, -0.38, 0,
      1, 0.38, 0,
      0, 0.16, 0,
    ],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    indices: [0, 1, 2, 0, 2, 3],
  };
}

function createDiscDecal(segments = 24): MeshData {
  const positions = [0, 0, 0];
  const normals = [0, 1, 0];
  const indices: number[] = [];
  for (let segment = 0; segment <= segments; segment += 1) {
    const angle = (segment / segments) * Math.PI * 2;
    positions.push(Math.cos(angle), 0, Math.sin(angle));
    normals.push(0, 1, 0);
  }
  for (let segment = 0; segment < segments; segment += 1) {
    indices.push(0, segment + 1, segment + 2);
  }
  return { positions, normals, indices };
}

function createArcRibbon(innerRadius = 0.94, outerRadius = 1, sweep = Math.PI * 1.18, segments = 32): MeshData {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (let segment = 0; segment <= segments; segment += 1) {
    const angle = -sweep / 2 + (segment / segments) * sweep;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    positions.push(cosine * innerRadius, 0, sine * innerRadius);
    positions.push(cosine * outerRadius, 0, sine * outerRadius);
    normals.push(0, 1, 0, 0, 1, 0);
  }
  for (let segment = 0; segment < segments; segment += 1) {
    const base = segment * 2;
    indices.push(base, base + 1, base + 3, base, base + 3, base + 2);
  }
  return { positions, normals, indices };
}

function createTorus(majorRadius = 1, tubeRadius = 0.04, majorSegments = 48, tubeSegments = 8): MeshData {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (let major = 0; major <= majorSegments; major += 1) {
    const u = (major / majorSegments) * Math.PI * 2;
    const cu = Math.cos(u);
    const su = Math.sin(u);
    for (let tube = 0; tube <= tubeSegments; tube += 1) {
      const v = (tube / tubeSegments) * Math.PI * 2;
      const cv = Math.cos(v);
      const sv = Math.sin(v);
      positions.push((majorRadius + tubeRadius * cv) * cu, tubeRadius * sv, (majorRadius + tubeRadius * cv) * su);
      normals.push(cv * cu, sv, cv * su);
    }
  }
  const row = tubeSegments + 1;
  for (let major = 0; major < majorSegments; major += 1) {
    for (let tube = 0; tube < tubeSegments; tube += 1) {
      const current = major * row + tube;
      const next = current + row;
      indices.push(current, next, next + 1, current, next + 1, current + 1);
    }
  }
  return { positions, normals, indices };
}

function createMesh(gl: WebGL2RenderingContext, data: MeshData): GpuMesh {
  const vao = gl.createVertexArray();
  const positionBuffer = gl.createBuffer();
  const normalBuffer = gl.createBuffer();
  const indexBuffer = gl.createBuffer();
  if (!vao || !positionBuffer || !normalBuffer || !indexBuffer) throw new Error("Unable to allocate WebGL buffers");

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data.positions), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data.normals), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(data.indices), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao, buffers: [positionBuffer, normalBuffer, indexBuffer], indexCount: data.indices.length };
}

export class AcousticLabScene {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly brightProgram: WebGLProgram;
  private readonly blurProgram: WebGLProgram;
  private readonly postProgram: WebGLProgram;
  private readonly particleProgram: WebGLProgram;
  private readonly mainUniforms: MainUniforms;
  private readonly particleUniforms: ParticleUniforms;
  private readonly brightUniforms: BrightUniforms;
  private readonly blurUniforms: BlurUniforms;
  private readonly postUniforms: PostUniforms;
  private readonly particleVao: WebGLVertexArrayObject;
  private readonly particleBuffer: WebGLBuffer;
  private readonly particleTrailVao: WebGLVertexArrayObject;
  private readonly particleTrailBuffer: WebGLBuffer;
  private readonly renderTarget: RenderTarget;
  private readonly projection = mat4.create();
  private readonly view = mat4.create();
  private readonly normalMatrix = mat3.create();
  private readonly meshes: Record<string, GpuMesh>;
  private readonly particleCount = 180;
  private readonly particleState = new Float32Array(this.particleCount * 9);
  private readonly particleVertices = new Float32Array(this.particleCount * 6);
  private readonly particleTrailVertices = new Float32Array(this.particleCount * 12);
  private readonly particleLowColor = vec3.create();
  private readonly particleMidColor = vec3.create();
  private readonly particleHighColor = vec3.create();
  private controls: SceneControls = {
    rotorRate: 0.8,
    direction: 1,
    rotatorAmount: 1,
    dopplerAmount: 1,
    motion: 0.35,
    depth: 0.75,
    reducedMotion: false,
  };
  private audio: AudioFrame = { low: 0, mid: 0, high: 0, peak: 0 };
  private frame = 0;
  private lastFrameTime = 0;
  private hornPhase = 0.38;
  private drumPhase = 0.92;
  private visualSignedRate = 0.8;
  private visualDirection: 1 | -1 = 1;
  private telemetrySignedRate: number | undefined;
  private telemetryRateUpdatedAt = -Infinity;
  private lastAudioSequence: number | undefined;
  // The orthographic composition is part of the visual identity. Keep it stable
  // so the rotor motion, telemetry labels, and particle trails stay comparable
  // across plugin hosts and window sizes.
  private readonly cameraYaw = 0.58;
  private readonly cameraPitch = 0.34;
  private readonly cameraDistance = 8.0;
  private visible = true;
  private renderWidth = 0;
  private renderHeight = 0;
  private particleClock = 0;
  private readonly resizeObserver: ResizeObserver;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      antialias: true,
      alpha: false,
      depth: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error("WebGL 2 is required for the rotor preview");
    this.canvas = canvas;
    this.gl = gl;
    this.program = createProgram(gl);
    this.brightProgram = createProgram(gl, postVertexSource, brightFragmentSource);
    this.blurProgram = createProgram(gl, postVertexSource, blurFragmentSource);
    this.postProgram = createProgram(gl, postVertexSource, postFragmentSource);
    this.particleProgram = createProgram(gl, particleVertexSource, particleFragmentSource);
    this.mainUniforms = {
      projection: gl.getUniformLocation(this.program, "uProjection"),
      view: gl.getUniformLocation(this.program, "uView"),
      model: gl.getUniformLocation(this.program, "uModel"),
      normalMatrix: gl.getUniformLocation(this.program, "uNormalMatrix"),
      color: gl.getUniformLocation(this.program, "uColor"),
      opacity: gl.getUniformLocation(this.program, "uOpacity"),
      emission: gl.getUniformLocation(this.program, "uEmission"),
      ambient: gl.getUniformLocation(this.program, "uAmbient"),
      lightDirection: gl.getUniformLocation(this.program, "uLightDirection"),
    };
    this.particleUniforms = {
      projection: gl.getUniformLocation(this.particleProgram, "uProjection"),
      view: gl.getUniformLocation(this.particleProgram, "uView"),
      pointScale: gl.getUniformLocation(this.particleProgram, "uPointScale"),
      lowColor: gl.getUniformLocation(this.particleProgram, "uLowColor"),
      midColor: gl.getUniformLocation(this.particleProgram, "uMidColor"),
      highColor: gl.getUniformLocation(this.particleProgram, "uHighColor"),
      opacity: gl.getUniformLocation(this.particleProgram, "uOpacity"),
      glow: gl.getUniformLocation(this.particleProgram, "uGlow"),
      trailMode: gl.getUniformLocation(this.particleProgram, "uTrailMode"),
    };
    this.brightUniforms = {
      scene: gl.getUniformLocation(this.brightProgram, "uScene"),
    };
    this.blurUniforms = {
      source: gl.getUniformLocation(this.blurProgram, "uSource"),
      direction: gl.getUniformLocation(this.blurProgram, "uDirection"),
    };
    this.postUniforms = {
      scene: gl.getUniformLocation(this.postProgram, "uScene"),
      bloom: gl.getUniformLocation(this.postProgram, "uBloom"),
      texelSize: gl.getUniformLocation(this.postProgram, "uTexelSize"),
      outlineStrength: gl.getUniformLocation(this.postProgram, "uOutlineStrength"),
      glowStrength: gl.getUniformLocation(this.postProgram, "uGlowStrength"),
    };
    vec3.lerp(this.particleLowColor, palette.rust, palette.paper, 0.16);
    vec3.lerp(this.particleMidColor, palette.indigo, palette.pine, 0.30);
    vec3.lerp(this.particleHighColor, palette.brass, palette.paper, 0.26);
    this.renderTarget = createRenderTarget(gl);

    const particleVao = gl.createVertexArray();
    const particleBuffer = gl.createBuffer();
    const particleTrailVao = gl.createVertexArray();
    const particleTrailBuffer = gl.createBuffer();
    if (!particleVao || !particleBuffer || !particleTrailVao || !particleTrailBuffer) {
      throw new Error("Unable to allocate particle buffers");
    }
    this.particleVao = particleVao;
    this.particleBuffer = particleBuffer;
    this.particleTrailVao = particleTrailVao;
    this.particleTrailBuffer = particleTrailBuffer;
    gl.bindVertexArray(particleVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.particleVertices.byteLength, gl.DYNAMIC_DRAW);
    const particleStride = 6 * Float32Array.BYTES_PER_ELEMENT;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, particleStride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, particleStride, 3 * Float32Array.BYTES_PER_ELEMENT);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, particleStride, 4 * Float32Array.BYTES_PER_ELEMENT);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, particleStride, 5 * Float32Array.BYTES_PER_ELEMENT);

    gl.bindVertexArray(particleTrailVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, particleTrailBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.particleTrailVertices.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, particleStride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, particleStride, 3 * Float32Array.BYTES_PER_ELEMENT);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, particleStride, 4 * Float32Array.BYTES_PER_ELEMENT);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, particleStride, 5 * Float32Array.BYTES_PER_ELEMENT);
    gl.bindVertexArray(null);
    this.resetParticles();
    const horn = createHornShell();
    const drum = createDrumShell();
    const panel = createPanelShell();
    const bassBasket = createAnnularFrustum();
    validateClosedShell("Horn shell", horn);
    validateClosedShell("Drum shell", drum);
    validateClosedShell("Cabinet panel", panel);
    validateClosedShell("Bass basket", bassBasket);
    validateRotorClearance();
    const box = createBox();
    const cylinder = createCylinder(1, 1, 16);
    const drumPlate = createAnnularCylinder(1.03, 0.31, 0.08, 16);
    const bearingRing = createAnnularCylinder(0.72, 0.13, 0.10, 16);
    const hornCollar = createAnnularCylinder(0.19, 0.05, 0.24, 12);
    const bassYoke = createAnnularCylinder(0.43, 0.12, 0.10, 12);
    const bassSurround = createAnnularCylinder(0.60, 0.27, 0.08, 12);
    const shadowDecal = createTaperedDecal();
    const floorShadowDecal = createDiscDecal();
    const auraArc = createArcRibbon();
    const auraArcAccent = createArcRibbon(0.965, 1, Math.PI * 0.42, 18);
    const torus = createTorus(1, 0.026, 28, 6);
    const drumScoop = createDrumScoop();
    validateClosedMesh("Box", box);
    validateClosedMesh("Cylinder", cylinder);
    validateClosedMesh("Drum plate", drumPlate);
    validateClosedMesh("Bearing ring", bearingRing);
    validateClosedMesh("Horn collar", hornCollar);
    validateClosedMesh("Bass yoke", bassYoke);
    validateClosedMesh("Bass surround", bassSurround);
    validateMesh("Shadow decal", shadowDecal);
    validateMesh("Floor shadow decal", floorShadowDecal);
    validateMesh("Aura arc", auraArc);
    validateMesh("Aura accent", auraArcAccent);
    validateClosedMesh("Wave ring", torus);
    validateClosedMesh("Drum scoop", drumScoop);
    this.meshes = {
      box: createMesh(gl, box),
      cylinder: createMesh(gl, cylinder),
      panelExterior: createMesh(gl, panel.exterior),
      panelInterior: createMesh(gl, panel.interior),
      panelEdges: createMesh(gl, panel.edges),
      bassBasketExterior: createMesh(gl, bassBasket.exterior),
      bassBasketInterior: createMesh(gl, bassBasket.interior),
      bassBasketEdges: createMesh(gl, bassBasket.edges),
      hornExterior: createMesh(gl, horn.exterior),
      hornInterior: createMesh(gl, horn.interior),
      hornEdges: createMesh(gl, horn.edges),
      hornCollar: createMesh(gl, hornCollar),
      drumExterior: createMesh(gl, drum.exterior),
      drumInterior: createMesh(gl, drum.interior),
      drumEdges: createMesh(gl, drum.edges),
      drumPlate: createMesh(gl, drumPlate),
      bearingRing: createMesh(gl, bearingRing),
      bassYoke: createMesh(gl, bassYoke),
      bassSurround: createMesh(gl, bassSurround),
      shadowDecal: createMesh(gl, shadowDecal),
      floorShadowDecal: createMesh(gl, floorShadowDecal),
      auraArc: createMesh(gl, auraArc),
      auraArcAccent: createMesh(gl, auraArcAccent),
      torus: createMesh(gl, torus),
      drumScoop: createMesh(gl, drumScoop),
    };

    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.clearColor(palette.screen[0], palette.screen[1], palette.screen[2], 1);
    gl.useProgram(this.program);
    gl.uniform3fv(this.mainUniforms.lightDirection, vec3.fromValues(0.45, 0.82, 0.36));

    document.addEventListener("visibilitychange", this.onVisibility);
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(canvas);
    this.resize();
    this.animate();
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibility);
    Object.values(this.meshes).forEach((mesh) => {
      this.gl.deleteVertexArray(mesh.vao);
      mesh.buffers.forEach((buffer) => this.gl.deleteBuffer(buffer));
    });
    this.gl.deleteProgram(this.program);
    this.gl.deleteProgram(this.brightProgram);
    this.gl.deleteProgram(this.blurProgram);
    this.gl.deleteProgram(this.postProgram);
    this.gl.deleteProgram(this.particleProgram);
    this.gl.deleteVertexArray(this.particleVao);
    this.gl.deleteBuffer(this.particleBuffer);
    this.gl.deleteVertexArray(this.particleTrailVao);
    this.gl.deleteBuffer(this.particleTrailBuffer);
    this.gl.deleteFramebuffer(this.renderTarget.sceneFramebuffer);
    this.gl.deleteFramebuffer(this.renderTarget.resolveFramebuffer);
    this.gl.deleteRenderbuffer(this.renderTarget.colorBuffer);
    this.gl.deleteRenderbuffer(this.renderTarget.depthBuffer);
    this.gl.deleteTexture(this.renderTarget.colorTexture);
    this.renderTarget.bloomFramebuffers.forEach((framebuffer) => this.gl.deleteFramebuffer(framebuffer));
    this.renderTarget.bloomTextures.forEach((texture) => this.gl.deleteTexture(texture));
  }

  setControls(next: Partial<SceneControls>) {
    this.controls = { ...this.controls, ...next };
  }

  setAudioFrame(frame: AudioFrame) {
    this.audio = {
      low: clamp01(frame.low),
      mid: clamp01(frame.mid),
      high: clamp01(frame.high),
      peak: clamp01(frame.peak),
    };
  }

  updateTelemetry(telemetry: Telemetry) {
    if (typeof telemetry.direction === "number") this.controls.direction = telemetry.direction < 0.5 ? 1 : -1;
    const sequence = telemetry.audioSequence;
    const hasFreshAudio = typeof sequence === "number"
      && Number.isFinite(sequence)
      && (this.lastAudioSequence === undefined || sequence !== this.lastAudioSequence);
    if (hasFreshAudio) this.lastAudioSequence = sequence;
    if (hasFreshAudio) {
      const signedRate = typeof telemetry.rotorSignedRate === "number"
        && Number.isFinite(telemetry.rotorSignedRate)
        ? Math.min(20, Math.max(-20, telemetry.rotorSignedRate))
        : undefined;
      const magnitude = typeof telemetry.rotorRate === "number" && Number.isFinite(telemetry.rotorRate)
        ? Math.min(20, Math.max(0, telemetry.rotorRate))
        : undefined;
      const targetRate = signedRate ?? (magnitude === undefined ? undefined : magnitude * this.controls.direction);
      if (targetRate !== undefined
          && (Math.abs(targetRate) > 0.0001 || sequence! > 0 || telemetry.playing === true)) {
        this.telemetrySignedRate = targetRate;
        this.telemetryRateUpdatedAt = performance.now();
      }
    }
    if (telemetry.bands?.length) {
      this.setAudioFrame({
        low: (telemetry.bands[0] ?? 0) * 18,
        mid: (telemetry.bands[1] ?? 0) * 18,
        high: (telemetry.bands[2] ?? 0) * 18,
        peak: telemetry.outputPeak ?? telemetry.inputPeak ?? 0,
      });
    }
  }

  private particleNoise(seed: number, salt: number) {
    const value = Math.sin((seed + salt) * 12.9898) * 43758.5453;
    return value - Math.floor(value);
  }

  private particleEnergy(band: number) {
    const response = this.controls.motion;
    const doppler = 0.18 + 0.82 * clamp01(this.controls.dopplerAmount);
    if (band === 0) return Math.sqrt(this.audio.high * response * doppler);
    if (band === 1) return Math.sqrt(this.audio.low * response * doppler);
    return Math.sqrt(this.audio.mid * response * (0.72 + doppler * 0.28));
  }

  private respawnParticle(index: number, initial = false) {
    const stateOffset = index * 9;
    const band = index % 3;
    const previousSeed = this.particleState[stateOffset + 8] || (index + 1) / this.particleCount;
    const seed = this.particleNoise(previousSeed + index * 0.173, this.particleClock * 0.071 + band * 1.91);
    const randomA = this.particleNoise(seed, 0.71);
    const randomB = this.particleNoise(seed, 2.37);
    const randomC = this.particleNoise(seed, 4.93);
    const energy = this.particleEnergy(band);

    let angle = randomA * Math.PI * 2;
    let radius = 0.20;
    let y = 0.04;
    let outward = 0.14 + energy * 0.34;
    let swirl = this.visualDirection * (0.10 + energy * 0.18);
    if (band === 0) {
      angle = this.hornPhase + (randomA > 0.5 ? Math.PI : 0) + (randomB - 0.5) * 0.26;
      radius = 0.38 + randomC * 0.20;
      y = 1.14 + (randomB - 0.5) * 0.20;
      outward = 0.28 + energy * 0.74;
      swirl = this.visualDirection * (0.18 + energy * 0.42);
    } else if (band === 1) {
      angle = this.drumPhase + (randomB - 0.5) * 0.34;
      radius = 0.86 + randomC * 0.20;
      y = -0.88 + (randomA - 0.5) * 0.46;
      outward = 0.20 + energy * 0.58;
      swirl = -this.visualDirection * (0.15 + energy * 0.34);
    }

    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    this.particleState[stateOffset] = cosine * radius;
    this.particleState[stateOffset + 1] = y;
    this.particleState[stateOffset + 2] = sine * radius;
    this.particleState[stateOffset + 3] = cosine * outward - sine * swirl;
    this.particleState[stateOffset + 4] = (randomC - 0.5) * (0.12 + energy * 0.16);
    this.particleState[stateOffset + 5] = sine * outward + cosine * swirl;
    const maxLife = 1.8 + randomB * 1.9;
    this.particleState[stateOffset + 6] = maxLife;
    this.particleState[stateOffset + 7] = maxLife;
    this.particleState[stateOffset + 8] = seed;

    if (initial) {
      const age = randomC * maxLife * 0.82;
      this.particleState[stateOffset] += this.particleState[stateOffset + 3] * age * 0.72;
      this.particleState[stateOffset + 1] += this.particleState[stateOffset + 4] * age * 0.72;
      this.particleState[stateOffset + 2] += this.particleState[stateOffset + 5] * age * 0.72;
      this.particleState[stateOffset + 6] = maxLife - age;
    }
  }

  private resetParticles() {
    for (let index = 0; index < this.particleCount; index += 1) this.respawnParticle(index, true);
  }

  private updateParticles(delta: number) {
    const dt = Math.min(1 / 30, Math.max(0, delta));
    this.particleClock += dt;
    for (let index = 0; index < this.particleCount; index += 1) {
      const stateOffset = index * 9;
      const vertexOffset = index * 6;
      const band = index % 3;
      let life = this.particleState[stateOffset + 6] - dt * (0.66 + band * 0.05);
      let x = this.particleState[stateOffset];
      let y = this.particleState[stateOffset + 1];
      let z = this.particleState[stateOffset + 2];
      const radius = Math.max(0.001, Math.hypot(x, z));
      if (life <= 0 || radius > 3.15 || y < -2.0 || y > 2.35) {
        this.respawnParticle(index);
        life = this.particleState[stateOffset + 6];
        x = this.particleState[stateOffset];
        y = this.particleState[stateOffset + 1];
        z = this.particleState[stateOffset + 2];
      }

      const energy = this.particleEnergy(band);
      const centerY = band === 0 ? 1.14 : (band === 1 ? -0.88 : 0.04);
      const direction = band === 1 ? -this.visualDirection : this.visualDirection;
      const gravity = (0.075 + energy * 0.24) / (0.44 + radius * radius);
      const tangent = direction * (0.055 + energy * (band === 2 ? 0.18 : 0.34));
      const inverseRadius = 1 / radius;
      const accelerationX = -x * gravity - z * inverseRadius * tangent;
      const accelerationZ = -z * gravity + x * inverseRadius * tangent;
      const seed = this.particleState[stateOffset + 8];
      const accelerationY = (centerY - y) * (0.20 + energy * 0.13)
        + Math.sin(this.particleClock * (1.2 + seed) + seed * 8) * (0.012 + energy * 0.034);
      const drag = Math.exp(-dt * (0.30 + band * 0.045));

      let velocityX = (this.particleState[stateOffset + 3] + accelerationX * dt) * drag;
      let velocityY = (this.particleState[stateOffset + 4] + accelerationY * dt) * drag;
      let velocityZ = (this.particleState[stateOffset + 5] + accelerationZ * dt) * drag;
      x += velocityX * dt;
      y += velocityY * dt;
      z += velocityZ * dt;

      this.particleState[stateOffset] = x;
      this.particleState[stateOffset + 1] = y;
      this.particleState[stateOffset + 2] = z;
      this.particleState[stateOffset + 3] = velocityX;
      this.particleState[stateOffset + 4] = velocityY;
      this.particleState[stateOffset + 5] = velocityZ;
      this.particleState[stateOffset + 6] = life;

      const maxLife = this.particleState[stateOffset + 7];
      const age = maxLife - life;
      const fade = Math.min(1, age * 3.2) * Math.min(1, life * 0.78);
      const visualEnergy = fade * (0.045 + energy * 0.72 + this.audio.peak * 0.10);
      this.particleVertices[vertexOffset] = x;
      this.particleVertices[vertexOffset + 1] = y;
      this.particleVertices[vertexOffset + 2] = z;
      this.particleVertices[vertexOffset + 3] = visualEnergy;
      this.particleVertices[vertexOffset + 4] = 2.80 + seed * 3.80 + energy * 2.80;
      this.particleVertices[vertexOffset + 5] = band;

      const trailOffset = index * 12;
      const trailScale = 0.42 + clamp01(this.controls.dopplerAmount) * 0.58;
      const trailLength = (0.075 + seed * 0.075 + energy * 0.13) * trailScale;
      this.particleTrailVertices[trailOffset] = x - velocityX * trailLength;
      this.particleTrailVertices[trailOffset + 1] = y - velocityY * trailLength;
      this.particleTrailVertices[trailOffset + 2] = z - velocityZ * trailLength;
      this.particleTrailVertices[trailOffset + 3] = visualEnergy * 0.24;
      this.particleTrailVertices[trailOffset + 4] = 1;
      this.particleTrailVertices[trailOffset + 5] = band;
      this.particleTrailVertices[trailOffset + 6] = x;
      this.particleTrailVertices[trailOffset + 7] = y;
      this.particleTrailVertices[trailOffset + 8] = z;
      this.particleTrailVertices[trailOffset + 9] = visualEnergy * 0.82;
      this.particleTrailVertices[trailOffset + 10] = 1;
      this.particleTrailVertices[trailOffset + 11] = band;
    }

    const { gl } = this;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.particleVertices);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleTrailBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.particleTrailVertices);
  }

  private renderParticles(opacity: number, glow: number) {
    const { gl } = this;
    const activeCount = this.canvas.clientWidth < 520 ? 96 : (this.canvas.clientWidth < 760 ? 132 : this.particleCount);
    gl.useProgram(this.particleProgram);
    gl.uniformMatrix4fv(this.particleUniforms.projection, false, this.projection);
    gl.uniformMatrix4fv(this.particleUniforms.view, false, this.view);
    gl.uniform1f(this.particleUniforms.pointScale, Math.min(window.devicePixelRatio || 1, 1.5));
    gl.uniform3fv(this.particleUniforms.lowColor, this.particleLowColor);
    gl.uniform3fv(this.particleUniforms.midColor, this.particleMidColor);
    gl.uniform3fv(this.particleUniforms.highColor, this.particleHighColor);
    gl.uniform1f(this.particleUniforms.opacity, opacity);
    gl.uniform1f(this.particleUniforms.glow, glow);
    gl.uniform1f(this.particleUniforms.trailMode, 1);
    gl.bindVertexArray(this.particleTrailVao);
    gl.drawArrays(gl.LINES, 0, activeCount * 2);
    gl.uniform1f(this.particleUniforms.trailMode, 0);
    gl.bindVertexArray(this.particleVao);
    gl.drawArrays(gl.POINTS, 0, activeCount);
  }

  private draw(mesh: GpuMesh, model: mat4, color: vec3, opacity = 1, emission = 0, ambient = 0.3) {
    const { gl } = this;
    mat3.normalFromMat4(this.normalMatrix, model);
    gl.uniformMatrix4fv(this.mainUniforms.model, false, model);
    gl.uniformMatrix3fv(this.mainUniforms.normalMatrix, false, this.normalMatrix);
    gl.uniform3fv(this.mainUniforms.color, color);
    gl.uniform1f(this.mainUniforms.opacity, opacity);
    gl.uniform1f(this.mainUniforms.emission, emission);
    gl.uniform1f(this.mainUniforms.ambient, ambient);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_SHORT, 0);
  }

  private box(position: vec3, scale: vec3, color: vec3, rotationY = 0, parent?: mat4, opacity = 1) {
    const model = parent ? mat4.clone(parent) : mat4.create();
    mat4.translate(model, model, position);
    if (rotationY !== 0) mat4.rotateY(model, model, rotationY);
    mat4.scale(model, model, scale);
    this.draw(this.meshes.box, model, color, opacity);
  }

  private cylinder(position: vec3, scale: vec3, color: vec3, parent?: mat4, emission = 0, opacity = 1, ambient = 0.3) {
    const model = parent ? mat4.clone(parent) : mat4.create();
    mat4.translate(model, model, position);
    mat4.scale(model, model, scale);
    this.draw(this.meshes.cylinder, model, color, opacity, emission, ambient);
  }

  private panel(
    position: vec3,
    scale: vec3,
    faceA: vec3,
    faceB: vec3,
    edge: vec3,
    rotationX = 0,
    rotationY = 0,
  ) {
    const model = mat4.create();
    mat4.translate(model, model, position);
    if (rotationY !== 0) mat4.rotateY(model, model, rotationY);
    if (rotationX !== 0) mat4.rotateX(model, model, rotationX);
    mat4.scale(model, model, scale);
    this.draw(this.meshes.panelExterior, model, faceA, 1, 0, 0.44);
    this.draw(this.meshes.panelInterior, model, faceB, 1, 0, 0.34);
    this.draw(this.meshes.panelEdges, model, edge, 1, 0, 0.54);
  }

  private meshAt(mesh: GpuMesh, position: vec3, color: vec3, parent?: mat4, emission = 0, ambient = 0.3) {
    const model = parent ? mat4.clone(parent) : mat4.create();
    mat4.translate(model, model, position);
    this.draw(mesh, model, color, 1, emission, ambient);
  }

  private renderCabinet() {
    const wallInside = vec3.lerp(vec3.create(), palette.inkSoft, palette.paper, 0.22);
    const wallSide = vec3.lerp(vec3.create(), palette.indigo, palette.paper, 0.20);
    const wallAccent = vec3.lerp(vec3.create(), palette.pine, palette.paper, 0.36);
    const wallOutside = vec3.lerp(vec3.create(), palette.indigo, palette.ink, 0.54);
    const trimLight = vec3.lerp(vec3.create(), palette.paper, palette.chrome, 0.18);
    const trimWarm = vec3.lerp(vec3.create(), palette.paper, palette.brass, 0.18);

    // The cabinet is an architectural cutaway: every visible wall has two faces
    // and a contrasting sealed edge, while the front-right corner stays open.
    this.panel(
      vec3.fromValues(0, -1.80, 0),
      vec3.fromValues(5.02, cabinetGeometry.floorHalfDepth * 2, 0.30),
      wallInside,
      palette.ink,
      palette.indigo,
      -Math.PI / 2,
    );
    this.panel(
      vec3.fromValues(0, 0.165, -(cabinetGeometry.innerHalfDepth + cabinetGeometry.wallThickness / 2)),
      vec3.fromValues(4.66, 3.63, 0.18),
      wallInside,
      wallOutside,
      trimLight,
    );
    this.panel(
      vec3.fromValues(-2.42, 0.165, 0),
      vec3.fromValues(cabinetGeometry.innerHalfDepth * 2, 3.63, 0.18),
      wallSide,
      wallOutside,
      trimLight,
      0,
      Math.PI / 2,
    );
    this.panel(
      vec3.fromValues(2.42, 0.165, -1.75),
      vec3.fromValues(0.86, 3.63, 0.18),
      wallAccent,
      wallOutside,
      trimLight,
      0,
      -Math.PI / 2,
    );
    this.panel(
      vec3.fromValues(0, 2.07, -1.75),
      vec3.fromValues(4.66, 0.86, 0.18),
      palette.paper,
      wallOutside,
      trimWarm,
      Math.PI / 2,
    );
    this.panel(
      vec3.fromValues(-1.97, 2.07, 0.43),
      vec3.fromValues(0.72, 3.50, 0.18),
      palette.paper,
      wallOutside,
      trimWarm,
      Math.PI / 2,
    );

    this.box(vec3.fromValues(0, -1.99, 0), vec3.fromValues(5.20, 0.10, 4.90), palette.ink);
    this.box(vec3.fromValues(0, 0.12, -2.155), vec3.fromValues(3.92, 0.07, 0.05), trimLight);
    this.box(vec3.fromValues(0, 1.10, -2.155), vec3.fromValues(3.92, 0.06, 0.05), wallAccent);
  }

  private renderFixedHardware() {
    const driverBody = vec3.lerp(vec3.create(), palette.chrome, palette.indigo, 0.38);
    const driverBand = vec3.lerp(vec3.create(), palette.indigo, palette.pine, 0.32);
    const driverShoulder = vec3.lerp(vec3.create(), driverBody, driverBand, 0.12);
    this.cylinder(vec3.fromValues(0, 1.72, 0.02), vec3.fromValues(0.34, 0.56, 0.34), driverBody, undefined, 0.02, 1, 0.42);
    this.cylinder(vec3.fromValues(0, 1.40, 0.02), vec3.fromValues(0.38, 0.10, 0.38), driverShoulder, undefined, 0, 1, 0.44);
    this.cylinder(vec3.fromValues(0, 2.04, 0.02), vec3.fromValues(0.31, 0.10, 0.31), driverShoulder, undefined, 0.02, 1, 0.46);

    const driverFlange = mat4.create();
    mat4.translate(driverFlange, driverFlange, vec3.fromValues(0, 1.29, 0.02));
    mat4.scale(driverFlange, driverFlange, vec3.fromValues(2.08, 0.22, 2.08));
    this.draw(this.meshes.hornCollar, driverFlange, driverBand, 1, 0.02, 0.46);

    for (let tabIndex = 0; tabIndex < 4; tabIndex += 1) {
      const tabRoot = mat4.create();
      mat4.rotateY(tabRoot, tabRoot, (tabIndex / 4) * Math.PI * 2 + Math.PI / 4);
      this.box(vec3.fromValues(0, 1.28, 0.40), vec3.fromValues(0.12, 0.055, 0.09), palette.pine, 0, tabRoot);
    }

    for (const [radius, color] of [
      [0.09, palette.brass],
      [0.17, driverBand],
      [0.25, palette.indigo],
    ] as const) {
      const topRing = mat4.create();
      mat4.translate(topRing, topRing, vec3.fromValues(0, 2.096, 0.02));
      mat4.scale(topRing, topRing, vec3.fromValues(radius, 1.30, radius));
      this.draw(this.meshes.torus, topRing, color, 1, radius < 0.10 ? 0.05 : 0.01, 0.48);
    }

    this.cylinder(vec3.fromValues(0, 0.72, 0.02), vec3.fromValues(0.09, 2.38, 0.09), palette.inkSoft);
    this.cylinder(vec3.fromValues(0, 1.18, 0.02), vec3.fromValues(0.33, 0.22, 0.33), palette.chrome);
    this.meshAt(this.meshes.bearingRing, vec3.fromValues(0, 0.04, 0.02), palette.chrome, undefined, 0, 0.38);
    const lowerBearing = mat4.create();
    mat4.translate(lowerBearing, lowerBearing, vec3.fromValues(0, -0.035, 0.02));
    mat4.scale(lowerBearing, lowerBearing, vec3.fromValues(0.82, 0.72, 0.82));
    this.draw(this.meshes.bearingRing, lowerBearing, palette.indigo, 1, 0, 0.34);
  }

  private renderHornRotor(highEnergy: number) {
    const rotor = mat4.create();
    mat4.translate(rotor, rotor, vec3.fromValues(0, 1.14, 0.02));
    mat4.rotateY(rotor, rotor, this.hornPhase);
    const depthScale = 0.92 + this.controls.depth * 0.18;
    const hornColor = vec3.lerp(vec3.create(), palette.brass, palette.paper, 0.16 + highEnergy * 0.06);
    const hornInteriorBase = vec3.lerp(vec3.create(), hornColor, palette.rust, 0.22);
    const hornInterior = vec3.lerp(vec3.create(), hornInteriorBase, hornColor, highEnergy * 0.10);
    const hornRim = vec3.lerp(vec3.create(), hornColor, palette.paper, 0.18);
    const hornVane = vec3.lerp(vec3.create(), hornInterior, palette.indigo, 0.22);
    const rotorBand = vec3.lerp(vec3.create(), palette.pine, palette.indigo, 0.34);

    for (const side of [0, Math.PI]) {
      const arm = mat4.clone(rotor);
      mat4.rotateY(arm, arm, side);

      this.box(
        vec3.fromValues(0.27, 0, 0),
        vec3.fromValues(0.30, 0.075, 0.14),
        rotorBand,
        0,
        arm,
      );

      const collar = mat4.clone(arm);
      mat4.translate(collar, collar, vec3.fromValues(0.13, 0, 0));
      mat4.rotateZ(collar, collar, -Math.PI / 2);
      this.draw(this.meshes.hornCollar, collar, rotorBand, 1, highEnergy * 0.10, 0.46);

      const model = mat4.clone(arm);
      mat4.translate(model, model, vec3.fromValues(hornGeometry.rootOffset, 0, 0));
      mat4.scale(model, model, vec3.fromValues(depthScale, 1, 1));
      this.draw(this.meshes.hornExterior, model, hornColor, 1, 0.018 + highEnergy * 0.15, 0.46);
      this.draw(this.meshes.hornInterior, model, hornInterior, 1, highEnergy * 0.10, 0.32);
      this.draw(this.meshes.hornEdges, model, hornRim, 1, 0.012 + highEnergy * 0.07, 0.52);

      for (let vaneIndex = 0; vaneIndex < 3; vaneIndex += 1) {
        const vane = mat4.clone(model);
        mat4.translate(vane, vane, vec3.fromValues(1.05, 0, 0));
        mat4.rotateX(vane, vane, (vaneIndex / 3) * Math.PI * 2);
        mat4.translate(vane, vane, vec3.fromValues(0, 0.245, 0));
        mat4.scale(vane, vane, vec3.fromValues(0.48, 0.20, 0.035));
        this.draw(this.meshes.box, vane, hornVane, 1, highEnergy * 0.08, 0.38);
      }

      const phasePlug = mat4.clone(model);
      mat4.translate(phasePlug, phasePlug, vec3.fromValues(1.12, 0, 0));
      mat4.rotateZ(phasePlug, phasePlug, -Math.PI / 2);
      mat4.scale(phasePlug, phasePlug, vec3.fromValues(0.11, 0.34, 0.11));
      this.draw(this.meshes.cylinder, phasePlug, hornRim, 1, highEnergy * 0.14, 0.48);
    }

    const hubRing = mat4.clone(rotor);
    mat4.scale(hubRing, hubRing, vec3.fromValues(0.56, 0.68, 0.56));
    this.draw(this.meshes.bearingRing, hubRing, rotorBand, 1, highEnergy * 0.08, 0.50);

    this.cylinder(
      vec3.fromValues(0, 0, 0),
      vec3.fromValues(0.24, 0.17, 0.24),
      vec3.lerp(vec3.create(), palette.brass, palette.paper, 0.10),
      rotor,
      highEnergy * 0.14,
      1,
      0.50,
    );
  }

  private renderFixedBassDriver(lowEnergy: number) {
    const basketColor = vec3.lerp(vec3.create(), palette.pine, palette.indigo, 0.32);
    const basketInner = vec3.lerp(vec3.create(), palette.ink, palette.indigo, 0.20);
    const basketEdge = vec3.lerp(vec3.create(), basketColor, palette.chrome, 0.22);
    this.cylinder(
      vec3.fromValues(0, -1.30, 0.04),
      vec3.fromValues(0.31, 0.26, 0.31),
      basketColor,
      undefined,
      lowEnergy * 0.12,
      1,
      0.42,
    );

    this.meshAt(this.meshes.bassYoke, vec3.fromValues(0, -1.10, 0.04), basketColor, undefined, lowEnergy * 0.08, 0.40);

    const basket = mat4.create();
    mat4.translate(basket, basket, vec3.fromValues(0, -0.86, 0.04));
    this.draw(this.meshes.bassBasketExterior, basket, basketColor, 1, lowEnergy * 0.10, 0.44);
    this.draw(this.meshes.bassBasketInterior, basket, basketInner, 1, lowEnergy * 0.04, 0.28);
    this.draw(this.meshes.bassBasketEdges, basket, basketEdge, 1, lowEnergy * 0.06, 0.52);

    this.meshAt(this.meshes.bassSurround, vec3.fromValues(0, -0.64, 0.04), basketEdge, undefined, lowEnergy * 0.08, 0.46);
    this.cylinder(
      vec3.fromValues(0, -0.60, 0.04),
      vec3.fromValues(0.22, 0.06, 0.22),
      vec3.lerp(vec3.create(), palette.brass, palette.paper, 0.12),
      undefined,
      lowEnergy * 0.18,
      1,
      0.48,
    );
  }

  private renderDrumRotor(lowEnergy: number) {
    const drum = mat4.create();
    mat4.translate(drum, drum, vec3.fromValues(0, -0.88, 0.04));
    mat4.rotateY(drum, drum, this.drumPhase);

    const shellColor = vec3.lerp(vec3.create(), palette.rust, palette.brass, 0.22 + lowEnergy * 0.06);
    const innerColor = vec3.lerp(vec3.create(), palette.ink, palette.indigo, 0.28);
    const drumEdgeColor = vec3.lerp(vec3.create(), shellColor, palette.chrome, 0.24);
    const scoopColor = vec3.lerp(vec3.create(), shellColor, palette.rust, 0.08);
    const drumTop = vec3.lerp(vec3.create(), palette.chrome, palette.indigo, 0.42);
    const drumDetail = vec3.lerp(vec3.create(), shellColor, palette.indigo, 0.38);
    this.draw(this.meshes.drumExterior, drum, shellColor, 1, 0.015 + lowEnergy * 0.075, 0.52);
    this.draw(this.meshes.drumInterior, drum, innerColor, 1, lowEnergy * 0.06, 0.28);
    this.draw(this.meshes.drumEdges, drum, drumEdgeColor, 1, lowEnergy * 0.08, 0.50);

    const scoop = mat4.clone(drum);
    mat4.translate(scoop, scoop, vec3.fromValues(0, -0.30, drumGeometry.radius));
    this.draw(this.meshes.drumScoop, scoop, scoopColor, 1, lowEnergy * 0.025, 0.36);

    this.box(vec3.fromValues(0, 0.02, -0.96), vec3.fromValues(0.48, 0.30, 0.10), palette.indigo, 0, drum);

    this.meshAt(this.meshes.drumPlate, vec3.fromValues(0, 0.70, 0), drumTop, drum, 0, 0.40);
    this.meshAt(this.meshes.drumPlate, vec3.fromValues(0, -0.70, 0), innerColor, drum, 0, 0.34);

    for (const [y, color] of [[0.70, drumTop], [-0.70, innerColor]] as const) {
      const edgeBand = mat4.clone(drum);
      mat4.translate(edgeBand, edgeBand, vec3.fromValues(0, y, 0));
      mat4.scale(edgeBand, edgeBand, vec3.fromValues(1.15, 1, 1.15));
      this.draw(this.meshes.torus, edgeBand, color, 1, lowEnergy * 0.08, 0.52);
    }

    for (let clampIndex = 0; clampIndex < 8; clampIndex += 1) {
      const angle = (clampIndex / 8) * Math.PI * 2 + Math.PI / 8;
      const portDistance = Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle)));
      if (portDistance < 0.70) continue;
      const clampRoot = mat4.clone(drum);
      mat4.rotateY(clampRoot, clampRoot, angle);
      this.box(vec3.fromValues(0, 0.61, 1.15), vec3.fromValues(0.13, 0.14, 0.10), drumDetail, 0, clampRoot);
      this.box(vec3.fromValues(0, -0.61, 1.15), vec3.fromValues(0.13, 0.12, 0.10), drumDetail, 0, clampRoot);
    }

    for (let spoke = 0; spoke < 4; spoke += 1) {
      const spokeModel = mat4.clone(drum);
      mat4.rotateY(spokeModel, spokeModel, (spoke / 4) * Math.PI * 2);
      this.box(vec3.fromValues(0, 0.77, 0.66), vec3.fromValues(0.09, 0.06, 0.66), palette.inkSoft, 0, spokeModel);
    }
    this.cylinder(vec3.fromValues(0, 0.78, 0), vec3.fromValues(0.24, 0.14, 0.24), palette.brass, drum, lowEnergy * 0.18);
  }

  private renderContactShadow() {
    const { gl } = this;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    const outerShadow = mat4.create();
    mat4.translate(outerShadow, outerShadow, vec3.fromValues(0.20, -1.642, 0.18));
    mat4.scale(outerShadow, outerShadow, vec3.fromValues(1.98, 1, 1.46));
    this.draw(this.meshes.floorShadowDecal, outerShadow, palette.shadow, 0.11, 0, 0.72);

    const coreShadow = mat4.create();
    mat4.translate(coreShadow, coreShadow, vec3.fromValues(0.20, -1.641, 0.18));
    mat4.scale(coreShadow, coreShadow, vec3.fromValues(1.58, 1, 1.14));
    this.draw(this.meshes.floorShadowDecal, coreShadow, palette.shadow, 0.20, 0, 0.72);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  private renderArchitecturalShadows() {
    const { gl } = this;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);

    for (const side of [0, Math.PI]) {
      const angle = this.hornPhase + side;
      const directionX = Math.cos(angle);
      const directionY = Math.sin(angle) * 0.22;
      const wallAngle = Math.atan2(directionY, directionX);
      const length = 0.64 + Math.abs(directionX) * 1.08;
      const outerShadow = mat4.create();
      mat4.translate(outerShadow, outerShadow, vec3.fromValues(0, 1.12, -2.172));
      mat4.rotateZ(outerShadow, outerShadow, wallAngle);
      mat4.scale(outerShadow, outerShadow, vec3.fromValues(length * 1.14, 0.84, 1));
      this.draw(this.meshes.shadowDecal, outerShadow, palette.shadow, 0.08, 0, 0.72);

      const coreShadow = mat4.create();
      mat4.translate(coreShadow, coreShadow, vec3.fromValues(0, 1.12, -2.171));
      mat4.rotateZ(coreShadow, coreShadow, wallAngle);
      mat4.scale(coreShadow, coreShadow, vec3.fromValues(length, 0.68, 1));
      this.draw(this.meshes.shadowDecal, coreShadow, palette.shadow, 0.18, 0, 0.72);
    }

    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  private renderAtmosphericLight(low: number, mid: number, high: number) {
    const { gl } = this;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);

    const beamColor = vec3.lerp(vec3.create(), palette.brass, palette.paper, 0.18);
    for (const side of [0, Math.PI]) {
      const angle = this.hornPhase + side;
      const directionX = Math.cos(angle);
      const directionY = Math.sin(angle) * 0.22;
      const wallAngle = Math.atan2(directionY, directionX);
      const length = 0.74 + Math.abs(directionX) * 1.12;

      const outerWash = mat4.create();
      mat4.translate(outerWash, outerWash, vec3.fromValues(0, 1.12, -2.168));
      mat4.rotateZ(outerWash, outerWash, wallAngle);
      mat4.scale(outerWash, outerWash, vec3.fromValues(length * 1.34, 1.18, 1));
      this.draw(this.meshes.shadowDecal, outerWash, beamColor, 0.020 + high * 0.050, 0.82, 0.78);

      const coreWash = mat4.create();
      mat4.translate(coreWash, coreWash, vec3.fromValues(0, 1.12, -2.167));
      mat4.rotateZ(coreWash, coreWash, wallAngle);
      mat4.scale(coreWash, coreWash, vec3.fromValues(length, 0.70, 1));
      this.draw(this.meshes.shadowDecal, coreWash, beamColor, 0.014 + high * 0.040, 1.0, 0.82);
    }

    const floorColor = vec3.lerp(vec3.create(), palette.rust, palette.indigo, 0.28 + mid * 0.10);
    const outerPool = mat4.create();
    mat4.translate(outerPool, outerPool, vec3.fromValues(0.08, -1.638, 0.08));
    mat4.scale(outerPool, outerPool, vec3.fromValues(1.82 + low * 0.24, 1, 1.48 + low * 0.18));
    this.draw(this.meshes.floorShadowDecal, outerPool, floorColor, 0.014 + low * 0.036, 0.86, 0.82);

    const innerPool = mat4.create();
    mat4.translate(innerPool, innerPool, vec3.fromValues(0.08, -1.637, 0.08));
    mat4.scale(innerPool, innerPool, vec3.fromValues(1.18 + low * 0.16, 1, 0.96 + low * 0.12));
    this.draw(this.meshes.floorShadowDecal, innerPool, floorColor, 0.012 + low * 0.030, 1.0, 0.86);

    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  private auraBands(low: number, mid: number, high: number) {
    return [
      {
        y: 1.14,
        radius: 1.72 + high * 0.42,
        color: vec3.lerp(vec3.create(), palette.brass, palette.indigo, 0.14),
        energy: high,
        phase: this.hornPhase * 0.56,
      },
      {
        y: -0.86,
        radius: 1.52 + low * 0.48,
        color: vec3.lerp(vec3.create(), palette.rust, palette.indigo, 0.20),
        energy: low,
        phase: this.drumPhase * 0.44 + 1.12,
      },
      {
        y: 0.06,
        radius: 1.92 + mid * 0.38,
        color: vec3.lerp(vec3.create(), palette.indigo, palette.pine, 0.18),
        energy: mid,
        phase: (this.hornPhase - this.drumPhase) * 0.18 - 0.72,
      },
    ];
  }

  private auraTransform(y: number, radius: number, index: number, phase: number) {
    const model = mat4.create();
    mat4.translate(model, model, vec3.fromValues(0, y, 0.03));
    mat4.rotateY(model, model, phase);
    mat4.rotateX(model, model, (index - 1) * 0.055 + Math.sin(this.hornPhase + index) * 0.018);
    mat4.rotateZ(model, model, Math.sin(this.drumPhase * 0.7 + index) * 0.035);
    mat4.scale(model, model, vec3.fromValues(radius, 0.72 + index * 0.08, radius));
    return model;
  }

  private renderBloomAccents(low: number, mid: number, high: number) {
    this.auraBands(low, mid, high).forEach((ring, index) => {
      const trail = this.auraTransform(ring.y, ring.radius, index, ring.phase);
      this.draw(this.meshes.auraArc, trail, ring.color, 0.056 + ring.energy * 0.052, 3.2 + ring.energy * 2.2, 0.92);

      const crest = this.auraTransform(ring.y + 0.008, ring.radius * 1.018, index, ring.phase - 0.42);
      this.draw(this.meshes.auraArcAccent, crest, ring.color, 0.082 + ring.energy * 0.068, 4.2 + ring.energy * 2.5, 0.94);
    });

    const beamColor = vec3.lerp(vec3.create(), palette.brass, palette.paper, 0.22);
    for (const side of [0, Math.PI]) {
      const angle = this.hornPhase + side;
      const directionX = Math.cos(angle);
      const wallAngle = Math.atan2(Math.sin(angle) * 0.22, directionX);
      const length = 0.74 + Math.abs(directionX) * 1.12;
      const beam = mat4.create();
      mat4.translate(beam, beam, vec3.fromValues(0, 1.12, -2.168));
      mat4.rotateZ(beam, beam, wallAngle);
      mat4.scale(beam, beam, vec3.fromValues(length * 1.30, 1.08, 1));
      this.draw(this.meshes.shadowDecal, beam, beamColor, 0.025 + high * 0.040, 4.8 + high * 2.2, 0.92);
    }

    const pool = mat4.create();
    mat4.translate(pool, pool, vec3.fromValues(0.08, -1.638, 0.08));
    mat4.scale(pool, pool, vec3.fromValues(1.62 + low * 0.24, 1, 1.30 + low * 0.18));
    const poolColor = vec3.lerp(vec3.create(), palette.rust, palette.indigo, 0.34 + mid * 0.08);
    this.draw(this.meshes.floorShadowDecal, pool, poolColor, 0.020 + low * 0.034, 4.4 + low * 2.0, 0.94);
  }

  private renderWaveRings(low: number, mid: number, high: number) {
    const { gl } = this;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);

    this.auraBands(low, mid, high).forEach((ring, index) => {
      const trail = this.auraTransform(ring.y, ring.radius, index, ring.phase);
      this.draw(this.meshes.auraArc, trail, ring.color, 0.011 + ring.energy * 0.034, 0.20 + ring.energy * 0.12, 0.66);

      const crest = this.auraTransform(ring.y + 0.008, ring.radius * 1.018, index, ring.phase - 0.42);
      this.draw(this.meshes.auraArcAccent, crest, ring.color, 0.017 + ring.energy * 0.040, 0.28 + ring.energy * 0.15, 0.68);
    });

    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  private renderScene() {
    const { gl } = this;
    const low = this.audio.low * this.controls.motion;
    const mid = this.audio.mid * this.controls.motion;
    const high = this.audio.high * this.controls.motion;
    const dopplerGlow = 0.04 + clamp01(this.controls.dopplerAmount) * 0.18;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.renderTarget.sceneFramebuffer);
    gl.viewport(0, 0, this.renderWidth, this.renderHeight);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.mainUniforms.projection, false, this.projection);
    gl.uniformMatrix4fv(this.mainUniforms.view, false, this.view);
    this.renderCabinet();
    this.renderArchitecturalShadows();
    this.renderContactShadow();
    this.renderAtmosphericLight(low, mid, high);
    this.renderFixedHardware();
    this.renderFixedBassDriver(low);
    this.renderDrumRotor(low);
    this.renderHornRotor(high);
    this.renderWaveRings(low, mid, high);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);
    this.renderParticles(0.98, 0.08 + dopplerGlow);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.renderTarget.sceneFramebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.renderTarget.resolveFramebuffer);
    gl.blitFramebuffer(
      0,
      0,
      this.renderWidth,
      this.renderHeight,
      0,
      0,
      this.renderWidth,
      this.renderHeight,
      gl.COLOR_BUFFER_BIT,
      gl.NEAREST,
    );

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    const bloomWidth = Math.max(1, Math.floor(this.renderWidth / 2));
    const bloomHeight = Math.max(1, Math.floor(this.renderHeight / 2));
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.renderTarget.bloomFramebuffers[0]);
    gl.viewport(0, 0, bloomWidth, bloomHeight);
    gl.useProgram(this.brightProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.renderTarget.colorTexture);
    gl.uniform1i(this.brightUniforms.scene, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.mainUniforms.projection, false, this.projection);
    gl.uniformMatrix4fv(this.mainUniforms.view, false, this.view);
    this.renderBloomAccents(low, mid, high);
    this.renderParticles(0.50, 2.20 + dopplerGlow * 4.0);
    gl.disable(gl.BLEND);

    gl.useProgram(this.blurProgram);
    for (let iteration = 0; iteration < 3; iteration += 1) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.renderTarget.bloomFramebuffers[1]);
      gl.bindTexture(gl.TEXTURE_2D, this.renderTarget.bloomTextures[0]);
      gl.uniform1i(this.blurUniforms.source, 0);
      gl.uniform2f(this.blurUniforms.direction, 1 / bloomWidth, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.renderTarget.bloomFramebuffers[0]);
      gl.bindTexture(gl.TEXTURE_2D, this.renderTarget.bloomTextures[1]);
      gl.uniform2f(this.blurUniforms.direction, 0, 1 / bloomHeight);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.renderWidth, this.renderHeight);
    gl.useProgram(this.postProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.renderTarget.colorTexture);
    gl.uniform1i(this.postUniforms.scene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.renderTarget.bloomTextures[0]);
    gl.uniform1i(this.postUniforms.bloom, 1);
    gl.uniform2f(this.postUniforms.texelSize, 1 / this.renderWidth, 1 / this.renderHeight);
    gl.uniform1f(this.postUniforms.outlineStrength, 0.30);
    gl.uniform1f(this.postUniforms.glowStrength, 0.90 + Math.max(low, mid, high) * 0.50);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.enable(gl.DEPTH_TEST);
  }

  private resize = () => {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    if (this.renderWidth !== width || this.renderHeight !== height) {
      this.renderWidth = width;
      this.renderHeight = height;
      resizeRenderTarget(this.gl, this.renderTarget, width, height);
    }
    this.gl.viewport(0, 0, width, height);
    const aspect = width / height;
    const halfHeight = Math.max(this.cameraDistance * 0.35, 2.95 / aspect);
    mat4.ortho(this.projection, -halfHeight * aspect, halfHeight * aspect, -halfHeight, halfHeight, 0.1, 50);
  };

  private updateCamera() {
    const horizontal = Math.cos(this.cameraPitch) * this.cameraDistance;
    const eye = vec3.fromValues(
      Math.sin(this.cameraYaw) * horizontal,
      0.25 + Math.sin(this.cameraPitch) * this.cameraDistance,
      Math.cos(this.cameraYaw) * horizontal,
    );
    mat4.lookAt(this.view, eye, vec3.fromValues(0, 0.08, -0.16), vec3.fromValues(0, 1, 0));
  }

  private animate = (time = performance.now()) => {
    if (!this.visible) return;
    this.frame = requestAnimationFrame(this.animate);
    const delta = this.lastFrameTime === 0 ? 1 / 60 : Math.min(0.05, Math.max(0, (time - this.lastFrameTime) / 1000));
    this.lastFrameTime = time;
    const motion = this.controls.reducedMotion ? 0.18 : 1;
    const amount = 0.22 + this.controls.rotatorAmount * 0.78;
    const hornBoost = 1 + this.audio.high * this.controls.motion * 0.42;
    const drumBoost = 1 + this.audio.low * this.controls.motion * 0.30;
    // Prefer a fresh native signed rate so the visual rotor coasts through
    // zero with the audio engine. Fall back to the target when no callback has
    // arrived recently (browser preview or a paused Standalone host).
    const nativeRateIsFresh = time - this.telemetryRateUpdatedAt < 0.18;
    const targetSignedRate = nativeRateIsFresh && this.telemetrySignedRate !== undefined
      ? this.telemetrySignedRate
      : this.controls.direction * Math.max(0, this.controls.rotorRate);
    const rateSmoothing = 1 - Math.exp(-delta / 0.055);
    this.visualSignedRate += (targetSignedRate - this.visualSignedRate) * rateSmoothing;
    if (Math.abs(this.visualSignedRate) > 0.0005)
      this.visualDirection = this.visualSignedRate < 0 ? -1 : 1;

    this.hornPhase += this.visualSignedRate * hornBoost * Math.PI * 2 * delta * amount * motion;
    this.drumPhase -= this.visualSignedRate * 0.46 * drumBoost * Math.PI * 2 * delta * amount * motion;
    this.updateParticles(delta * motion);
    this.updateCamera();
    this.renderScene();
  };

  private onVisibility = () => {
    this.visible = document.visibilityState === "visible";
    this.lastFrameTime = 0;
    if (this.visible) this.animate();
  };

}
