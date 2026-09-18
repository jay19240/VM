/** Code WGSL complet qui génère une texture de bruit procédural coloré. */
export const NOISE_SHADER_CODE = `
struct Params {
  color0: vec4f,
  color1: vec4f,
  color2: vec4f,
  color3: vec4f,
  color4: vec4f,
  color5: vec4f,
  resolution: vec2f,
  scale: f32,
  speed: f32,
  time: f32,
  numBands: f32,
  warpStrength: f32,
  smoothness: f32,
  showContours: f32,
  greyscaleMode: f32,
  _pad0: f32,
  _pad1: f32,
};

@group(0) @binding(0) var<uniform> params: Params;

struct VSOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex fn vs(@builtin(vertex_index) vertexIndex: u32) -> VSOutput {
  let pos = array(
    vec2f(0.0, 0.0),
    vec2f(1.0, 0.0),
    vec2f(0.0, 1.0),
    vec2f(0.0, 1.0),
    vec2f(1.0, 0.0),
    vec2f(1.0, 1.0),
  );

  var out: VSOutput;
  let xy = pos[vertexIndex];
  out.position = vec4f(xy * 2.0 - 1.0, 0.0, 1.0);
  out.uv = vec2f(xy.x, 1.0 - xy.y);
  return out;
}

fn hash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453);
}

fn noise2d(x: vec2f) -> f32 {
  let i = floor(x);
  var f = fract(x);
  f = f * f * (3.0 - 2.0 * f);

  let a = hash(i);
  let b = hash(i + vec2f(1.0, 0.0));
  let c = hash(i + vec2f(0.0, 1.0));
  let d = hash(i + vec2f(1.0, 1.0));

  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

fn fbm(p: vec2f) -> f32 {
  var v = 0.0;
  var a = 0.5;
  var x = p;
  let shift = vec2f(100.0);
  let rot = mat2x2f(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));

  for (var i = 0; i < 6; i = i + 1) {
    v = v + a * noise2d(x);
    x = rot * x * 2.0 + shift;
    a = a * 0.5;
  }
  return v;
}

fn getPalette(index: f32) -> vec3f {
  let raw = i32(index);
  let i = ((raw % 6) + 6) % 6;
  switch (i) {
    case 0: { return params.color0.rgb; }
    case 1: { return params.color1.rgb; }
    case 2: { return params.color2.rgb; }
    case 3: { return params.color3.rgb; }
    case 4: { return params.color4.rgb; }
    default: { return params.color5.rgb; }
  }
}

@fragment fn fs(in: VSOutput) -> @location(0) vec4f {
  let fragCoord = in.uv * params.resolution;
  let uv = fragCoord / params.resolution.y;
  let time = params.time * params.speed;

  var warp: vec2f;
  warp.x = fbm(uv * params.scale + vec2f(time));
  warp.y = fbm(uv * params.scale + vec2f(5.2, 1.3) + vec2f(time));

  let n = fbm(uv * params.scale + warp * params.warpStrength);

  if (params.greyscaleMode > 0.5) {
    return vec4f(vec3f(n), 1.0);
  }

  let v = n * params.numBands;
  let bandIndex = floor(v);
  let frac = fract(v);

  let col1 = getPalette(bandIndex);
  let col2 = getPalette(bandIndex + 1.0);

  let edge0 = 0.5 - (params.smoothness * 0.5);
  let edge1 = 0.5 + (params.smoothness * 0.5);

  var blend: f32;
  if (params.smoothness < 0.001) {
    blend = step(0.5, frac);
  } else {
    blend = smoothstep(edge0, edge1, frac);
  }

  var col = mix(col1, col2, blend);

  if (params.showContours > 0.5) {
    let distToEdge = min(frac, 1.0 - frac);
    let fw = fwidth(v);
    let lineMask = smoothstep(0.0, fw * 1.5, distToEdge);
    col = col * mix(0.75, 1.0, frac);
    let lineColor = vec3f(0.12, 0.12, 0.15);
    col = mix(lineColor, col, lineMask);
  }

  return vec4f(col, 1.0);
}`;
