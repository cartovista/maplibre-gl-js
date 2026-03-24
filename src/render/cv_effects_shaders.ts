/**
 * cv_effects_shaders.ts
 * CV-EFFECTS: All GLSL 300 ES shader source strings for the CartoVista FBO
 * post-processing pipeline.  Ported from demos/cv-effects/js/ShaderLib.js
 * (GLSL ES 1.00) to GLSL 300 ES for MapLibre's WebGL2 context.
 *
 * Changes from prototype:
 *   attribute  →  in (vertex)
 *   varying    →  out (vertex) / in (fragment)
 *   texture2D  →  texture
 *   gl_FragColor → out vec4 fragColor  (declared at top of each FS)
 */

// ─── Shared vertex shader ─────────────────────────────────────────────────────

/**
 * Full-screen quad vertex shader.
 * Draws a TRIANGLE_STRIP covering NDC [-1,1]² and passes UV coords to the FS.
 * Attrib layout: location 0 = a_pos (xy), location 1 = a_uv (uv).
 */
export const cvQuadVert = `#version 300 es
precision highp float;
in vec2 a_pos;
in vec2 a_uv;
out vec2 v_uv;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); v_uv = a_uv; }
`;

// ─── Dual Kawase blur (SIGGRAPH 2015 — Marius Bjørge / ARM) ──────────────────
//
// u_rcp = vec2(1/output_width, 1/output_height) — OUTPUT buffer reciprocal
// u_off = offset multiplier for continuous radius (range [1.0, 2.0))
//
// CV-EFFECTS: Channel convention for the blur pipeline
// Pyramid FBOs are RGBA8. Blur-result FBOs (_blurShadow, _blurGlow, _blurInner)
// are R8 single-channel (allocated at half resolution).
//
// Kawase shaders write vec4(v,v,v,v) so downstream passes can read either
// .r or .a from the pyramid without needing two shader variants for RGBA vs R8.
// Consumer shaders (shadow, innerGlow) read .r since their source is an R8 FBO.

/** Kawase downsample — 5 taps (centre ×4 + 4 diagonal corners ×1) / 8. */
export const cvKawaseDownFrag = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2      u_rcp;
uniform float     u_off;
in vec2 v_uv;
out vec4 fragColor;
void main() {
  vec2 hp = u_rcp * 0.5 * u_off;
  float a  = texture(u_tex, v_uv).a * 4.0;
  a += texture(u_tex, v_uv + vec2(-hp.x, -hp.y)).a;
  a += texture(u_tex, v_uv + vec2( hp.x, -hp.y)).a;
  a += texture(u_tex, v_uv + vec2(-hp.x,  hp.y)).a;
  a += texture(u_tex, v_uv + vec2( hp.x,  hp.y)).a;
  float v = a / 8.0;
  fragColor = vec4(v, v, v, v);
}
`;

/** Kawase upsample — 8 taps (4 edge-centres ×1 + 4 diagonal corners ×2) / 12. */
export const cvKawaseUpFrag = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2      u_rcp;
uniform float     u_off;
in vec2 v_uv;
out vec4 fragColor;
void main() {
  vec2 hp = u_rcp * 0.5 * u_off;
  float a = 0.0;
  a += texture(u_tex, v_uv + vec2(-2.0*hp.x,       0.0)).a;
  a += texture(u_tex, v_uv + vec2( 2.0*hp.x,       0.0)).a;
  a += texture(u_tex, v_uv + vec2(       0.0, -2.0*hp.y)).a;
  a += texture(u_tex, v_uv + vec2(       0.0,  2.0*hp.y)).a;
  a += texture(u_tex, v_uv + vec2(-hp.x,  hp.y)).a * 2.0;
  a += texture(u_tex, v_uv + vec2( hp.x,  hp.y)).a * 2.0;
  a += texture(u_tex, v_uv + vec2(-hp.x, -hp.y)).a * 2.0;
  a += texture(u_tex, v_uv + vec2( hp.x, -hp.y)).a * 2.0;
  float v = a / 12.0;
  fragColor = vec4(v, v, v, v);
}`;

// ─── Effect composite shaders ─────────────────────────────────────────────────

/**
 * Shadow / outer-glow composite shader.
 * Reads the Kawase-blurred alpha mask and tints it with the effect colour.
 * Output is premultiplied RGBA for blendFunc(ONE, ONE_MINUS_SRC_ALPHA).
 *
 * ×2 normalisation: Kawase yields α≈0.5 at the polygon edge.
 * Multiplying by 2 and clamping means strength=1.0 produces a fully opaque
 * shadow/glow right at the edge.
 *
 * Shared by drop shadow (with UV offset) and outer glow (no offset).
 *
 * CV-EFFECTS: Reads .r because u_tex is an R8 single-channel FBO (blur result).
 * The blur FBO is also half-resolution; linear filtering handles the upscale.
 *
 * u_color.rgb = effect colour
 * u_color.a   = opacity  (0–1)
 * u_strength  = strength (0–1)
 */
export const cvShadowFrag = `#version 300 es
precision mediump float;
uniform sampler2D u_tex;
uniform vec4      u_color;
uniform float     u_strength;
uniform vec2      u_offset;   // CV-EFFECTS: UV-space displacement for shadow (vec2(0) for glow)
in vec2 v_uv;
out vec4 fragColor;
void main() {
  // Sampling at (v_uv + u_offset) displaces the blurred shadow in UV space.
  // offset = (cos(angle)*dist/W, -sin(angle)*dist/H) — see EffectsRenderer.
  // .r because u_tex is an R8 blur-result FBO (Kawase writes vec4(v,v,v,v)).
  float blurA = texture(u_tex, v_uv + u_offset).r;
  float a = min(blurA * 2.0 * u_strength, 1.0) * u_color.a;
  fragColor = vec4(u_color.rgb * a, a);
}
`;

/**
 * Inner-glow composite shader.
 * Reads the Kawase-blurred silhouette AND the original layer silhouette.
 * Strongest at the inside edge, fades toward the centre.
 * Masked by layerAlpha so the glow only appears inside the shape.
 *
 * CV-EFFECTS: u_blurTex is an R8 single-channel FBO (blur result) → read .r.
 *             u_layerTex is the full-res RGBA layer capture FBO → read .a.
 *
 * u_blurTex  = TEXTURE0 — Kawase blur result (R8, half-res)
 * u_layerTex = TEXTURE1 — original layer FBO (RGBA, full-res shape mask)
 * u_color.a  = opacity (0–1)
 * u_strength = strength (0–1)
 */
export const cvInnerGlowFrag = `#version 300 es
precision mediump float;
uniform sampler2D u_blurTex;
uniform sampler2D u_layerTex;
uniform vec4      u_color;
uniform float     u_strength;
in vec2 v_uv;
out vec4 fragColor;
void main() {
  float blurA  = texture(u_blurTex,  v_uv).r;  // R8 blur-result FBO
  float layerA = texture(u_layerTex, v_uv).a;  // RGBA layer capture FBO
  // (1-blurA)*2 is ~0 deep inside and ~1 at the inner edge.
  float edgeA = min((1.0 - blurA) * 2.0 * u_strength, 1.0);
  float a = edgeA * layerA * u_color.a;
  fragColor = vec4(u_color.rgb * a, a);
}
`;

/**
 * Layer blit shader.
 * Samples the layer FBO and multiplies by u_opacity.
 * Scaling in the shader preserves premultiplication:
 *   rgb *= opacity  and  a *= opacity  together.
 * blendFunc(ONE, ONE_MINUS_SRC_ALPHA) then composites correctly.
 *
 * u_tex     = layer capture FBO texture
 * u_opacity = overall fill-opacity (0–1)
 */
export const cvLayerFrag = `#version 300 es
precision mediump float;
uniform sampler2D u_tex;
uniform float     u_opacity;
in vec2 v_uv;
out vec4 fragColor;
void main() { fragColor = texture(u_tex, v_uv) * u_opacity; }
`;

// ─── Complex blend mode shaders ───────────────────────────────────────────────
//
// Used when cv-blend-mode is 'overlay' or 'hardlight'.
// These modes require reading BOTH the layer and the background in the same
// fragment shader (WebGL cannot blend with a formula that reads the destination).
// Workflow: capture background → _bgCaptureFBO, then run the blend shader over
// the full-screen quad with blend OFF — the shader writes the final composited
// pixel directly.
//
// Ported from demos/cv-effects/js/ShaderLib.js (GLSL ES 1.00 → GLSL 300 ES).
//
// u_layer = TEXTURE0 — composited layer (premultiplied RGBA)
// u_bg    = TEXTURE1 — map background captured before our composite pass

/**
 * Overlay blend mode.
 * Per-channel: if dst < 0.5 → Multiply(2·src·dst),
 *              else         → Screen(1−2·(1−src)·(1−dst))
 * The background luminance controls whether the layer multiplies or screens.
 */
export const cvOverlayBlendFrag = `#version 300 es
precision mediump float;
uniform sampler2D u_layer;
uniform sampler2D u_bg;
in vec2 v_uv;
out vec4 fragColor;
vec3 blendOverlay(vec3 src, vec3 dst) {
  return mix(2.0*src*dst, 1.0-2.0*(1.0-src)*(1.0-dst), step(0.5, dst));
}
void main() {
  vec4 layer   = texture(u_layer, v_uv);
  vec3 bg      = texture(u_bg,    v_uv).rgb;
  float a      = layer.a;
  vec3 src     = a > 0.001 ? layer.rgb / a : vec3(0.0);
  vec3 blended = blendOverlay(src, bg);
  fragColor    = vec4(blended * a + bg * (1.0 - a), 1.0);
}
`;

/**
 * Hard Light blend mode.
 * Identical formula to Overlay with src and dst swapped:
 * Per-channel: if src < 0.5 → Multiply(2·src·dst),
 *              else         → Screen(1−2·(1−src)·(1−dst))
 * Produces strong contrast governed by the layer colour.
 */
export const cvHardlightBlendFrag = `#version 300 es
precision mediump float;
uniform sampler2D u_layer;
uniform sampler2D u_bg;
in vec2 v_uv;
out vec4 fragColor;
vec3 blendHardlight(vec3 src, vec3 dst) {
  return mix(2.0*src*dst, 1.0-2.0*(1.0-src)*(1.0-dst), step(0.5, src));
}
void main() {
  vec4 layer   = texture(u_layer, v_uv);
  vec3 bg      = texture(u_bg,    v_uv).rgb;
  float a      = layer.a;
  vec3 src     = a > 0.001 ? layer.rgb / a : vec3(0.0);
  vec3 blended = blendHardlight(src, bg);
  fragColor    = vec4(blended * a + bg * (1.0 - a), 1.0);
}
`;
