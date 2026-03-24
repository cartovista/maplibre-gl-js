/**
 * effects_renderer.ts
 * CV-EFFECTS: FBO post-processing pipeline for CartoVista visual effects.
 *
 * Manages its own WebGL programs, FBOs, and the full-screen quad.
 * Hooks into Painter.renderLayer() to capture layer output and composite
 * shadow, outer glow, inner glow (fill only), and blend modes on top.
 *
 * Program compilation and FBO lifecycle are kept completely separate from
 * MapLibre's shader/program infrastructure (shaders.ts, program_uniforms.ts).
 */

import {Framebuffer} from '../gl/framebuffer';
import {Color} from '@maplibre/maplibre-gl-style-spec';
import {
    cvQuadVert,
    cvKawaseDownFrag,
    cvKawaseUpFrag,
    cvShadowFrag,
    cvInnerGlowFrag,
    cvLayerFrag,
    cvOverlayBlendFrag,
    cvHardlightBlendFrag,
} from './cv_effects_shaders';

import type {Context} from '../gl/context';
import type {Painter} from './painter';
import type {FillStyleLayer} from '../style/style_layer/fill_style_layer';
import type {LineStyleLayer} from '../style/style_layer/line_style_layer';
import type {CircleStyleLayer} from '../style/style_layer/circle_style_layer';
import type {SymbolStyleLayer} from '../style/style_layer/symbol_style_layer';
import type {FillExtrusionStyleLayer} from '../style/style_layer/fill_extrusion_style_layer';
import type {HeatmapStyleLayer} from '../style/style_layer/heatmap_style_layer';
import type {RasterStyleLayer} from '../style/style_layer/raster_style_layer';

/** Union of all layer types that support at least cv-blend-mode. */
export type CvEffectsLayer =
    | FillStyleLayer
    | LineStyleLayer
    | CircleStyleLayer
    | SymbolStyleLayer
    | FillExtrusionStyleLayer
    | HeatmapStyleLayer
    | RasterStyleLayer;

// ─── Shared cv-* paint values extracted from any supported layer type ─────────
// TypeScript cannot call .get() on the union FillPaintProps | LinePaintProps
// because the generic overload signatures are incompatible.  We extract all
// values we need once, via narrowed branches, into this plain object.

type CvEffectValues = {
    blendMode:         string;
    shadowEnabled:     boolean;
    shadowSize:        number;
    shadowDist:        number;
    shadowAngle:       number;
    shadowColor:       Color;
    shadowOpacity:     number;
    shadowStrength:    number;
    outerGlowEnabled:  boolean;
    outerGlowSize:     number;
    outerGlowColor:    Color;
    outerGlowOpacity:  number;
    outerGlowStrength: number;
    innerGlowEnabled:  boolean;
    innerGlowSize:     number;
    innerGlowColor:    Color;
    innerGlowOpacity:  number;
    innerGlowStrength: number;
};

/** Returns zeroed CvEffectValues with only blendMode set (for blend-only layers). */
function blendOnlyValues(blendMode: string): CvEffectValues {
    return {
        blendMode,
        shadowEnabled:     false,
        shadowSize:        0,
        shadowDist:        0,
        shadowAngle:       0,
        shadowColor:       Color.transparent,
        shadowOpacity:     0,
        shadowStrength:    0,
        outerGlowEnabled:  false,
        outerGlowSize:     0,
        outerGlowColor:    Color.transparent,
        outerGlowOpacity:  0,
        outerGlowStrength: 0,
        innerGlowEnabled:  false,
        innerGlowSize:     0,
        innerGlowColor:    Color.transparent,
        innerGlowOpacity:  0,
        innerGlowStrength: 0,
    };
}

function extractCvEffectValues(layer: CvEffectsLayer): CvEffectValues {
    // ── Full set: fill, circle, fill-extrusion, symbol ────────────────────────
    if (layer.type === 'fill') {
        const p = (layer as FillStyleLayer).paint;
        return {
            blendMode:         (p.get('cv-blend-mode') as string) || 'normal',
            shadowEnabled:     p.get('cv-shadow-enabled') as boolean,
            shadowSize:        p.get('cv-shadow-size') as number,
            shadowDist:        p.get('cv-shadow-distance') as number,
            shadowAngle:       p.get('cv-shadow-angle') as number,
            shadowColor:       p.get('cv-shadow-color') as Color,
            shadowOpacity:     p.get('cv-shadow-opacity') as number,
            shadowStrength:    p.get('cv-shadow-strength') as number,
            outerGlowEnabled:  p.get('cv-outer-glow-enabled') as boolean,
            outerGlowSize:     p.get('cv-outer-glow-size') as number,
            outerGlowColor:    p.get('cv-outer-glow-color') as Color,
            outerGlowOpacity:  p.get('cv-outer-glow-opacity') as number,
            outerGlowStrength: p.get('cv-outer-glow-strength') as number,
            innerGlowEnabled:  p.get('cv-inner-glow-enabled') as boolean,
            innerGlowSize:     p.get('cv-inner-glow-size') as number,
            innerGlowColor:    p.get('cv-inner-glow-color') as Color,
            innerGlowOpacity:  p.get('cv-inner-glow-opacity') as number,
            innerGlowStrength: p.get('cv-inner-glow-strength') as number,
        };
    }
    if (layer.type === 'circle') {
        const p = (layer as CircleStyleLayer).paint;
        return {
            blendMode:         (p.get('cv-blend-mode') as string) || 'normal',
            shadowEnabled:     p.get('cv-shadow-enabled') as boolean,
            shadowSize:        p.get('cv-shadow-size') as number,
            shadowDist:        p.get('cv-shadow-distance') as number,
            shadowAngle:       p.get('cv-shadow-angle') as number,
            shadowColor:       p.get('cv-shadow-color') as Color,
            shadowOpacity:     p.get('cv-shadow-opacity') as number,
            shadowStrength:    p.get('cv-shadow-strength') as number,
            outerGlowEnabled:  p.get('cv-outer-glow-enabled') as boolean,
            outerGlowSize:     p.get('cv-outer-glow-size') as number,
            outerGlowColor:    p.get('cv-outer-glow-color') as Color,
            outerGlowOpacity:  p.get('cv-outer-glow-opacity') as number,
            outerGlowStrength: p.get('cv-outer-glow-strength') as number,
            innerGlowEnabled:  p.get('cv-inner-glow-enabled') as boolean,
            innerGlowSize:     p.get('cv-inner-glow-size') as number,
            innerGlowColor:    p.get('cv-inner-glow-color') as Color,
            innerGlowOpacity:  p.get('cv-inner-glow-opacity') as number,
            innerGlowStrength: p.get('cv-inner-glow-strength') as number,
        };
    }
    if (layer.type === 'fill-extrusion') {
        const p = (layer as FillExtrusionStyleLayer).paint;
        return {
            blendMode:         (p.get('cv-blend-mode') as string) || 'normal',
            shadowEnabled:     p.get('cv-shadow-enabled') as boolean,
            shadowSize:        p.get('cv-shadow-size') as number,
            shadowDist:        p.get('cv-shadow-distance') as number,
            shadowAngle:       p.get('cv-shadow-angle') as number,
            shadowColor:       p.get('cv-shadow-color') as Color,
            shadowOpacity:     p.get('cv-shadow-opacity') as number,
            shadowStrength:    p.get('cv-shadow-strength') as number,
            outerGlowEnabled:  p.get('cv-outer-glow-enabled') as boolean,
            outerGlowSize:     p.get('cv-outer-glow-size') as number,
            outerGlowColor:    p.get('cv-outer-glow-color') as Color,
            outerGlowOpacity:  p.get('cv-outer-glow-opacity') as number,
            outerGlowStrength: p.get('cv-outer-glow-strength') as number,
            innerGlowEnabled:  p.get('cv-inner-glow-enabled') as boolean,
            innerGlowSize:     p.get('cv-inner-glow-size') as number,
            innerGlowColor:    p.get('cv-inner-glow-color') as Color,
            innerGlowOpacity:  p.get('cv-inner-glow-opacity') as number,
            innerGlowStrength: p.get('cv-inner-glow-strength') as number,
        };
    }
    if (layer.type === 'symbol') {
        const p = (layer as SymbolStyleLayer).paint;
        return {
            blendMode:         (p.get('cv-blend-mode') as string) || 'normal',
            shadowEnabled:     p.get('cv-shadow-enabled') as boolean,
            shadowSize:        p.get('cv-shadow-size') as number,
            shadowDist:        p.get('cv-shadow-distance') as number,
            shadowAngle:       p.get('cv-shadow-angle') as number,
            shadowColor:       p.get('cv-shadow-color') as Color,
            shadowOpacity:     p.get('cv-shadow-opacity') as number,
            shadowStrength:    p.get('cv-shadow-strength') as number,
            outerGlowEnabled:  p.get('cv-outer-glow-enabled') as boolean,
            outerGlowSize:     p.get('cv-outer-glow-size') as number,
            outerGlowColor:    p.get('cv-outer-glow-color') as Color,
            outerGlowOpacity:  p.get('cv-outer-glow-opacity') as number,
            outerGlowStrength: p.get('cv-outer-glow-strength') as number,
            innerGlowEnabled:  p.get('cv-inner-glow-enabled') as boolean,
            innerGlowSize:     p.get('cv-inner-glow-size') as number,
            innerGlowColor:    p.get('cv-inner-glow-color') as Color,
            innerGlowOpacity:  p.get('cv-inner-glow-opacity') as number,
            innerGlowStrength: p.get('cv-inner-glow-strength') as number,
        };
    }
    // ── Shadow + outer-glow (no inner-glow): line ─────────────────────────────
    if (layer.type === 'line') {
        const p = (layer as LineStyleLayer).paint;
        return {
            blendMode:         (p.get('cv-blend-mode') as string) || 'normal',
            shadowEnabled:     p.get('cv-shadow-enabled') as boolean,
            shadowSize:        p.get('cv-shadow-size') as number,
            shadowDist:        p.get('cv-shadow-distance') as number,
            shadowAngle:       p.get('cv-shadow-angle') as number,
            shadowColor:       p.get('cv-shadow-color') as Color,
            shadowOpacity:     p.get('cv-shadow-opacity') as number,
            shadowStrength:    p.get('cv-shadow-strength') as number,
            outerGlowEnabled:  p.get('cv-outer-glow-enabled') as boolean,
            outerGlowSize:     p.get('cv-outer-glow-size') as number,
            outerGlowColor:    p.get('cv-outer-glow-color') as Color,
            outerGlowOpacity:  p.get('cv-outer-glow-opacity') as number,
            outerGlowStrength: p.get('cv-outer-glow-strength') as number,
            innerGlowEnabled:  false,
            innerGlowSize:     0,
            innerGlowColor:    Color.transparent,
            innerGlowOpacity:  0,
            innerGlowStrength: 0,
        };
    }
    // ── Blend-mode only: heatmap, raster ──────────────────────────────────────
    if (layer.type === 'heatmap') {
        const blendMode = ((layer as HeatmapStyleLayer).paint.get('cv-blend-mode') as string) || 'normal';
        return blendOnlyValues(blendMode);
    }
    // raster (and any future blend-only type)
    const blendMode = ((layer as RasterStyleLayer).paint.get('cv-blend-mode') as string) || 'normal';
    return blendOnlyValues(blendMode);
}

// ─── Internal types ───────────────────────────────────────────────────────────

type KawaseProg = {
    prog: WebGLProgram;
    u_tex: WebGLUniformLocation;
    u_rcp: WebGLUniformLocation;
    u_off: WebGLUniformLocation;
};

type ShadowProg = {
    prog: WebGLProgram;
    u_tex: WebGLUniformLocation;
    u_color: WebGLUniformLocation;
    u_strength: WebGLUniformLocation;
    u_offset: WebGLUniformLocation;
};

type InnerGlowProg = {
    prog: WebGLProgram;
    u_blurTex: WebGLUniformLocation;
    u_layerTex: WebGLUniformLocation;
    u_color: WebGLUniformLocation;
    u_strength: WebGLUniformLocation;
};

type LayerProg = {
    prog: WebGLProgram;
    u_tex: WebGLUniformLocation;
    u_opacity: WebGLUniformLocation;
};

/** Dual-texture blend shader for Overlay and Hard Light modes. */
type DualBlendProg = {
    prog: WebGLProgram;
    u_layer: WebGLUniformLocation;
    u_bg: WebGLUniformLocation;
};

type CvPrograms = {
    kawaseDown: KawaseProg;
    kawaseUp: KawaseProg;
    shadow: ShadowProg;
    innerGlow: InnerGlowProg;
    layer: LayerProg;
    overlayBlend: DualBlendProg;
    hardlightBlend: DualBlendProg;
};

// ─── EffectsRenderer ─────────────────────────────────────────────────────────

/**
 * CV-EFFECTS: Manages the GPU resources and rendering logic for the
 * CartoVista FBO post-processing pipeline.
 *
 * Lifecycle:
 *   1. Painter calls `hasEffects(layer)` to decide whether to intercept.
 *   2. Painter calls `beginCapture(painter)` before `drawFill(...)`.
 *   3. `drawFill` renders normally — output goes to `layerCaptureFBO`.
 *   4. Painter calls `composite(painter, layer)` to run blur passes and
 *      blit the final composited result to the default framebuffer.
 *   5. On canvas resize, Painter calls `destroyFBOs()` so they are
 *      re-created at the new size on the next frame.
 */
export class EffectsRenderer {
    private readonly _context: Context;
    private readonly _gl: WebGL2RenderingContext;

    private _programs: CvPrograms | null = null;
    private _quadVBO: WebGLBuffer | null = null;
    private _quadVAO: WebGLVertexArrayObject | null = null;

    // Full-resolution FBOs (canvas size)
    private _layerCaptureFBO: Framebuffer | null = null;
    private _compositeFBO: Framebuffer | null = null;   // collects all effect draws before final blend
    private _bgCaptureFBO: Framebuffer | null = null;   // map background snapshot for overlay/hardlight
    private _blurShadowFBO: Framebuffer | null = null;
    private _blurGlowFBO: Framebuffer | null = null;
    private _blurInnerFBO: Framebuffer | null = null;

    // Dual Kawase mip pyramid: kawaseFBOs[i] is at W>>i+1, H>>i+1
    private _kawaseFBOs: Framebuffer[] = [];

    private _w = 0;
    private _h = 0;

    // CV-EFFECTS: Blend-state tracking — caches the current WebGL blend state
    // so redundant enable/func/equation calls are skipped within composite().
    // Reset to null at the start of each composite() call to ensure correctness.
    private _blendEnabled:   boolean | null = null;
    private _blendSrcFactor: number  | null = null;
    private _blendDstFactor: number  | null = null;
    private _blendEquation:  number  | null = null;


    static readonly MAX_LEVELS = 8;

    constructor(context: Context) {
        this._context = context;
        this._gl = context.gl as WebGL2RenderingContext;
        // Compile programs early so first-frame cost is negligible
        try {
            this._programs = this._initPrograms();
            this._initQuad();
        } catch (e) {
            // Non-fatal: effects will be disabled if compilation fails
            console.warn('[CV-EFFECTS] Shader compilation failed — effects disabled.', e);
        }
    }

    // ─── Public API ──────────────────────────────────────────────────────────

    /**
     * Returns true if this layer has at least one cv-* effect enabled.
     * Called from Painter.renderLayer() to skip all overhead for plain layers.
     */
    hasEffects(layer: CvEffectsLayer): boolean {
        if (!this._programs) return false;
        const cv = extractCvEffectValues(layer);
        return !!(
            cv.blendMode !== 'normal' ||
            cv.shadowEnabled ||
            cv.outerGlowEnabled ||
            cv.innerGlowEnabled
        );
    }

    /**
     * Binds the layer capture FBO and clears it.
     * Must be called immediately before drawFill().
     */
    beginCapture(painter: Painter): void {
        const W = painter.width;
        const H = painter.height;
        this.ensureFBOs(W, H);
        // Force alpha-write mode: MapLibre's opaque render pass uses ColorMode.unblended
        // which sets colorMask(R,G,B,false) — the alpha channel is not written to the
        // framebuffer.  When rendering into the cv-effects FBO we need all four channels
        // so that the compositor can read correct alpha values.  cvCaptureMode makes
        // colorModeForRenderPass() return alphaBlended instead of unblended.
        painter.cvCaptureMode = true;
        this._context.bindFramebuffer.set(this._layerCaptureFBO.framebuffer);
        this._context.viewport.set([0, 0, W, H]);
        // Clear colour and stencil.  Painter.renderLayer() will call
        // _renderTileClippingMasks() immediately after beginCapture() to write
        // fresh tile stencil refs into the FBO's stencil buffer before drawFill().
        this._context.clear({color: Color.transparent, depth: 1, stencil: 0});
    }

    /**
     * Composites shadow, glow, and the original layer onto the default framebuffer.
     * Called immediately after the layer draw function returns.
     */
    composite(painter: Painter, layer: CvEffectsLayer): void {
        const {_context: ctx, _gl: gl, _programs: prog} = this;
        if (!prog) return;

        const W = painter.width;
        const H = painter.height;
        const cv = extractCvEffectValues(layer);

        const layerTex  = this._layerCaptureFBO.colorAttachment.get();
        const compFBO   = this._compositeFBO;

        // Disable depth, stencil, scissor — composite quads are 2D post-process passes
        ctx.depthTest.set(false);
        gl.disable(gl.SCISSOR_TEST);
        gl.disable(gl.STENCIL_TEST);
        gl.colorMask(true, true, true, true);

        // Reset blend-state cache so helpers reflect a clean slate each frame.
        this._blendEnabled = this._blendSrcFactor = this._blendDstFactor = this._blendEquation = null;

        // ── Step 1: collect shadow + glow + fill + inner-glow → _compositeFBO ─
        // All effect draws go here first so the blend mode can be applied to the
        // whole layer as a single unit in the final blit.
        gl.bindFramebuffer(gl.FRAMEBUFFER, compFBO.framebuffer);
        gl.viewport(0, 0, W, H);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        // Standard premultiplied-alpha "over" blend for intra-layer compositing.
        // _runKawase() disables blending internally; _setBlend deduplicates the
        // re-enable calls so only the first after each runKawase hits the driver.
        this._setBlend(true);
        this._setBlendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        this._setBlendEq(gl.FUNC_ADD);

        if (cv.shadowEnabled) {
            this._runKawase(layerTex, cv.shadowSize, this._blurShadowFBO);

            // Angle convention: 0° = right, 45° = down-right, 90° = down.
            const angleRad = cv.shadowAngle * Math.PI / 180;
            const offsetU  = -(Math.cos(angleRad) * cv.shadowDist) / W;
            const offsetV  =  (Math.sin(angleRad) * cv.shadowDist) / H;

            this._setBlend(true);
            gl.bindFramebuffer(gl.FRAMEBUFFER, compFBO.framebuffer);
            gl.viewport(0, 0, W, H);
            this._drawShadow(
                prog.shadow,
                this._blurShadowFBO.colorAttachment.get(),
                cv.shadowColor, cv.shadowOpacity, cv.shadowStrength,
                offsetU, offsetV,
            );
        }

        if (cv.outerGlowEnabled) {
            this._runKawase(layerTex, cv.outerGlowSize, this._blurGlowFBO);

            this._setBlend(true);
            gl.bindFramebuffer(gl.FRAMEBUFFER, compFBO.framebuffer);
            gl.viewport(0, 0, W, H);
            this._drawShadow(
                prog.shadow,
                this._blurGlowFBO.colorAttachment.get(),
                cv.outerGlowColor, cv.outerGlowOpacity, cv.outerGlowStrength,
                0, 0,
            );
        }

        // ── Original layer blit → _compositeFBO ───────────────────────────────
        this._setBlend(true);  // deduped: no-op when outerGlow or shadow drew above
        gl.bindFramebuffer(gl.FRAMEBUFFER, compFBO.framebuffer);
        gl.viewport(0, 0, W, H);
        this._blitLayer(prog.layer, layerTex);

        // Inner glow — fill only (lines have no enclosed area)
        if (cv.innerGlowEnabled) {
            this._runKawase(layerTex, cv.innerGlowSize, this._blurInnerFBO);

            this._setBlend(true);
            gl.bindFramebuffer(gl.FRAMEBUFFER, compFBO.framebuffer);
            gl.viewport(0, 0, W, H);
            this._drawInnerGlow(
                prog.innerGlow,
                this._blurInnerFBO.colorAttachment.get(),
                layerTex,
                cv.innerGlowColor, cv.innerGlowOpacity, cv.innerGlowStrength,
            );
        }

        // ── Step 2: blit _compositeFBO → screen with the layer blend mode ──────
        const compTex = compFBO.colorAttachment.get();

        if (cv.blendMode === 'overlay' || cv.blendMode === 'hardlight') {
            // Complex modes: capture current screen content → _bgCaptureFBO, then
            // run a dual-texture blend shader that reads both layer and background.
            const bgFBO = this._bgCaptureFBO;
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, bgFBO.framebuffer);
            gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);

            ctx.bindFramebuffer.set(null);
            ctx.viewport.set([0, 0, W, H]);
            this._setBlend(false);  // shader computes final pixel directly

            const blendProg = cv.blendMode === 'overlay' ? prog.overlayBlend : prog.hardlightBlend;
            gl.useProgram(blendProg.prog);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, compTex);
            gl.uniform1i(blendProg.u_layer, 0);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, bgFBO.colorAttachment.get());
            gl.uniform1i(blendProg.u_bg, 1);
            this._drawQuad();
            this._setBlend(true);
        } else {
            // Simple modes: fixed-function WebGL blending.
            ctx.bindFramebuffer.set(null);
            ctx.viewport.set([0, 0, W, H]);
            this._setBlend(true);
            this._applyBlendMode(cv.blendMode);
            this._blitLayer(prog.layer, compTex);
            this._restoreBlend();
        }

        // Restore alpha-write override so subsequent layers render normally.
        painter.cvCaptureMode = false;

        // Invalidate MapLibre's program cache so it re-binds on the next draw
        ctx.program.set(null);
        ctx.bindVertexArray.set(null);
    }

    /**
     * Creates or re-creates all FBOs at the given canvas dimensions.
     * Called from beginCapture(); also safe to call from resize().
     */
    ensureFBOs(w: number, h: number): void {
        if (w === this._w && h === this._h) return;
        this.destroyFBOs();
        this._w = w;
        this._h = h;

        // Layer capture needs depth+stencil so MapLibre's tile stencil masking
        // works correctly inside the FBO (prevents tile overlap artifacts).
        this._layerCaptureFBO = this._makeFBO(w, h, true);
        this._compositeFBO    = this._makeFBO(w, h);
        this._bgCaptureFBO    = this._makeFBO(w, h);

        // CV-EFFECTS: Blur-result FBOs at half resolution with R8 single-channel
        // format.  The blur already removes high-frequency detail, so 2× downscale
        // is visually lossless but cuts Kawase bandwidth by ~4× (pixel count).
        // R8 vs RGBA8 cuts a further 4× of memory bandwidth on blur reads/writes.
        // Shadow/glow shaders read .r (not .a) from these — see cvShadowFrag.
        const hw = Math.max(1, w >> 1);
        const hh = Math.max(1, h >> 1);
        this._blurShadowFBO = this._makeFBO(hw, hh, false, true);
        this._blurGlowFBO   = this._makeFBO(hw, hh, false, true);
        this._blurInnerFBO  = this._makeFBO(hw, hh, false, true);

        // Kawase mip pyramid: each level halves both dimensions
        let pw = Math.max(1, w >> 1);
        let ph = Math.max(1, h >> 1);
        for (let i = 0; i < EffectsRenderer.MAX_LEVELS; i++) {
            this._kawaseFBOs.push(this._makeFBO(pw, ph));
            pw = Math.max(1, pw >> 1);
            ph = Math.max(1, ph >> 1);
            if (pw <= 1 && ph <= 1) break;
        }
    }

    /** Destroys all GPU-side FBOs and textures.  Called from Painter.resize(). */
    destroyFBOs(): void {
        this._layerCaptureFBO?.destroy();
        this._compositeFBO?.destroy();
        this._bgCaptureFBO?.destroy();
        this._blurShadowFBO?.destroy();
        this._blurGlowFBO?.destroy();
        this._blurInnerFBO?.destroy();
        for (const fbo of this._kawaseFBOs) fbo.destroy();
        this._layerCaptureFBO = null;
        this._compositeFBO    = null;
        this._bgCaptureFBO    = null;
        this._blurShadowFBO   = null;
        this._blurGlowFBO     = null;
        this._blurInnerFBO    = null;
        this._kawaseFBOs      = [];
        this._w = 0;
        this._h = 0;
    }

    // ─── Private helpers ─────────────────────────────────────────────────────

    /**
     * Dual Kawase blur — direct port from the prototype EffectsRenderer.
     * Runs a downsample + upsample pyramid of up to MAX_LEVELS levels.
     * Result is written into `dstFBO` at full canvas resolution.
     *
     * @param srcTex  Input texture (the layer capture FBO colour attachment)
     * @param size    Desired blur radius in screen pixels
     * @param dstFBO  Full-resolution FBO to receive the blurred result
     */
    private _runKawase(
        srcTex: WebGLTexture,
        size: number,
        dstFBO: Framebuffer,
    ): void {
        const {_gl: gl, _context: ctx, _programs: prog, _kawaseFBOs: pyramid} = this;
        if (!prog || pyramid.length === 0) return;

        // Kawase passes are pure texture-filter operations that write into
        // intermediate FBOs.  Blending must be OFF so each frame overwrites
        // rather than accumulates on top of the previous frame's content,
        // which would cause the blur radius to grow without bound on pan/zoom.
        this._setBlend(false);

        const levels = Math.min(
            Math.max(1, Math.floor(Math.log2(Math.max(1, size)))),
            pyramid.length,
        );
        // offset stays in [1, 2) — gives smooth continuous radius control
        const offset = size / Math.pow(2, levels);

        // ── Downsample pass ───────────────────────────────────────────────────
        // No gl.clear() needed — each full-screen TRIANGLE_STRIP draw overwrites
        // every pixel in the target FBO, so pre-clearing is wasted GPU work.
        gl.useProgram(prog.kawaseDown.prog);
        gl.uniform1i(prog.kawaseDown.u_tex, 0);
        gl.uniform1f(prog.kawaseDown.u_off, offset);

        let prevTex = srcTex;
        for (let i = 0; i < levels; i++) {
            const dst = pyramid[i];
            this._bindFBOForDraw(dst);
            gl.uniform2f(prog.kawaseDown.u_rcp, 1 / dst.width, 1 / dst.height);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, prevTex);
            this._drawQuad();
            prevTex = dst.colorAttachment.get();
        }

        // ── Upsample pass ─────────────────────────────────────────────────────
        gl.useProgram(prog.kawaseUp.prog);
        gl.uniform1i(prog.kawaseUp.u_tex, 0);
        gl.uniform1f(prog.kawaseUp.u_off, offset);

        for (let i = levels - 2; i >= 0; i--) {
            const dst = pyramid[i];
            this._bindFBOForDraw(dst);
            gl.uniform2f(prog.kawaseUp.u_rcp, 1 / dst.width, 1 / dst.height);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, prevTex);
            this._drawQuad();
            prevTex = dst.colorAttachment.get();
        }

        // ── Final upsample → dstFBO (may be half-res for shadow/glow/inner) ──
        // Use dstFBO.width/height so u_rcp matches the actual render-target size,
        // not the canvas size (important since blur FBOs are at W/2 × H/2).
        this._bindFBOForDraw(dstFBO);
        gl.uniform2f(prog.kawaseUp.u_rcp, 1 / dstFBO.width, 1 / dstFBO.height);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, prevTex);
        this._drawQuad();
    }

    /** Draws the shadow or outer glow using the pre-blurred texture. */
    private _drawShadow(
        prog: ShadowProg,
        blurTex: WebGLTexture,
        color: Color,
        opacity: number,
        strength: number,
        offsetU: number,
        offsetV: number,
    ): void {
        const gl = this._gl;
        gl.useProgram(prog.prog);
        gl.uniform1i(prog.u_tex, 0);
        gl.uniform4f(prog.u_color, color.r, color.g, color.b, opacity);
        gl.uniform1f(prog.u_strength, strength);
        gl.uniform2f(prog.u_offset, offsetU, offsetV);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, blurTex);
        this._drawQuad();
    }

    /** Draws the inner glow masked by the original layer silhouette. */
    private _drawInnerGlow(
        prog: InnerGlowProg,
        blurTex: WebGLTexture,
        layerTex: WebGLTexture,
        color: Color,
        opacity: number,
        strength: number,
    ): void {
        const gl = this._gl;
        gl.useProgram(prog.prog);
        gl.uniform1i(prog.u_blurTex, 0);
        gl.uniform1i(prog.u_layerTex, 1);
        gl.uniform4f(prog.u_color, color.r, color.g, color.b, opacity);
        gl.uniform1f(prog.u_strength, strength);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, blurTex);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, layerTex);
        this._drawQuad();
    }

    /** Blits the layer texture to the currently bound framebuffer. */
    private _blitLayer(prog: LayerProg, layerTex: WebGLTexture): void {
        const gl = this._gl;
        gl.useProgram(prog.prog);
        gl.uniform1i(prog.u_tex, 0);
        gl.uniform1f(prog.u_opacity, 1.0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, layerTex);
        this._drawQuad();
    }

    /**
     * Binds an FBO for drawing and sets the viewport to match its dimensions.
     * Used in _runKawase() to switch between pyramid levels.
     */
    private _bindFBOForDraw(fbo: Framebuffer): void {
        const gl = this._gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.framebuffer);
        gl.viewport(0, 0, fbo.width, fbo.height);
    }

    /**
     * Renders the full-screen quad using the currently bound program.
     * Assumes the quad VAO is already bound via _bindQuadVAO().
     */
    private _drawQuad(): void {
        this._bindQuadVAO();
        this._gl.drawArrays(this._gl.TRIANGLE_STRIP, 0, 4);
    }

    /** Binds the quad VAO (sets up attrib pointers for a_pos and a_uv). */
    private _bindQuadVAO(): void {
        const gl = this._gl;
        // Use null VAO (default) to avoid touching MapLibre's VAO state
        this._context.bindVertexArray.set(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, this._quadVBO);
        // Stride 16 bytes: [x(4), y(4), u(4), v(4)]
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);  // a_pos
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);  // a_uv
        gl.enableVertexAttribArray(0);
        gl.enableVertexAttribArray(1);
    }

    // ─── Resource creation ────────────────────────────────────────────────────

    /**
     * Creates an FBO with an optional depth+stencil renderbuffer.
     *
     * Pass hasDepthStencil=true for the layer capture FBO so MapLibre's
     * tile stencil masking works correctly (prevents tile overlap artifacts).
     *
     * CV-EFFECTS: Pass r8=true for alpha-only blur-result FBOs (_blurShadow,
     * _blurGlow, _blurInner).  R8 uses 1 byte/px vs 4 for RGBA8 — 4× less
     * GPU memory bandwidth on texture reads/writes for those passes.
     * r8 is incompatible with hasDepthStencil.
     *
     * The texture is owned by the FBO and freed by Framebuffer.destroy().
     */
    private _makeFBO(w: number, h: number, hasDepthStencil = false, r8 = false): Framebuffer {
        const gl = this._gl;
        const ctx = this._context;
        const useR8 = r8 && !hasDepthStencil; // R8 is incompatible with depth+stencil

        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        if (useR8) {
            // texStorage2D allocates immutable R8 storage.  WebGL2 guarantees R8
            // is color-renderable so no framebuffer-complete fallback is needed.
            gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R8, w, h);
        } else {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        }
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindTexture(gl.TEXTURE_2D, null);

        // hasDepth=true is required when hasStencil=true (MapLibre Framebuffer constraint).
        // We must also allocate and attach the renderbuffer storage — createFramebuffer
        // only creates the attachment *object*, it does not allocate GPU memory.
        const fbo = ctx.createFramebuffer(w, h, hasDepthStencil, hasDepthStencil);
        fbo.colorAttachment.set(tex);
        if (hasDepthStencil) {
            // gl.DEPTH_STENCIL allocates a packed DEPTH24_STENCIL8 renderbuffer,
            // which provides the stencil buffer MapLibre's tile clipping masks need.
            const rbo = ctx.createRenderbuffer(gl.DEPTH_STENCIL, w, h);
            fbo.depthAttachment.set(rbo);
        }
        // Restore default FBO binding after colorAttachment/depthAttachment.set() leaves it bound
        this._context.bindFramebuffer.set(null);
        return fbo;
    }

    /**
     * Initialises the full-screen quad VBO.
     * Layout (interleaved, 4 vertices × 16 bytes):
     *   [x, y, u, v]  — NDC position + UV, TRIANGLE_STRIP order
     *   BL(-1,-1,0,0) BR(1,-1,1,0) TL(-1,1,0,1) TR(1,1,1,1)
     */
    private _initQuad(): void {
        const gl = this._gl;
        this._quadVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._quadVBO);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,  0, 0,   // BL
             1, -1,  1, 0,   // BR
            -1,  1,  0, 1,   // TL
             1,  1,  1, 1,   // TR
        ]), gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }

    // ─── Blend-state deduplication helpers ───────────────────────────────────
    //
    // Direct gl.enable/disable(BLEND), gl.blendFunc(), gl.blendEquation() calls
    // bypass MapLibre's Context state machine, so we track state ourselves.
    // These helpers skip any call whose value matches the last-set value,
    // eliminating redundant driver calls across the multi-pass composite loop.

    /** Enable or disable blending, skipping redundant GL calls. */
    private _setBlend(on: boolean): void {
        if (this._blendEnabled === on) return;
        this._blendEnabled = on;
        // Use MapLibre's context wrapper so its own state machine stays in sync.
        this._context.blend.set(on);
    }

    /** Set blend function, skipping redundant GL calls. */
    private _setBlendFunc(src: number, dst: number): void {
        if (this._blendSrcFactor === src && this._blendDstFactor === dst) return;
        this._blendSrcFactor = src;
        this._blendDstFactor = dst;
        this._gl.blendFunc(src, dst);
    }

    /** Set blend equation, skipping redundant GL calls. */
    private _setBlendEq(eq: number): void {
        if (this._blendEquation === eq) return;
        this._blendEquation = eq;
        this._gl.blendEquation(eq);
    }

    /**
     * Applies a WebGL fixed-function blend mode for simple layer blending.
     * Called before the final _compositeFBO → screen blit.
     *
     *   NORMAL    — premultiplied alpha "over":  (ONE, ONE_MINUS_SRC_ALPHA)
     *   MULTIPLY  — layer colour × destination:  (DST_COLOR, ONE_MINUS_SRC_ALPHA)
     *   SCREEN    — inverse multiply:            (ONE, ONE_MINUS_SRC_COLOR)
     *   ADD       — additive light:              (ONE, ONE)
     *   LIGHTEN   — per-channel max:             blendEquation(MAX) + (ONE, ONE)
     */
    private _applyBlendMode(mode: string): void {
        const gl = this._gl;
        switch (mode) {
            case 'multiply':
                this._setBlendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA);
                this._setBlendEq(gl.FUNC_ADD);
                break;
            case 'screen':
                this._setBlendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
                this._setBlendEq(gl.FUNC_ADD);
                break;
            case 'add':
                this._setBlendFunc(gl.ONE, gl.ONE);
                this._setBlendEq(gl.FUNC_ADD);
                break;
            case 'lighten':
                // WebGL2 provides gl.MAX natively (no extension needed).
                this._setBlendFunc(gl.ONE, gl.ONE);
                this._setBlendEq(gl.MAX);
                break;
            default: // 'normal'
                this._setBlendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
                this._setBlendEq(gl.FUNC_ADD);
                break;
        }
    }

    /** Restores the standard premultiplied-alpha "over" blend. */
    private _restoreBlend(): void {
        const gl = this._gl;
        this._setBlendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        this._setBlendEq(gl.FUNC_ADD);
    }

    /**
     * Compiles all effect programs and caches uniform locations.
     * Uses raw WebGL calls — completely independent of MapLibre's shaders.ts.
     */
    private _initPrograms(): CvPrograms {
        const kawaseDown     = this._compileProgram(cvQuadVert, cvKawaseDownFrag);
        const kawaseUp       = this._compileProgram(cvQuadVert, cvKawaseUpFrag);
        const shadow         = this._compileProgram(cvQuadVert, cvShadowFrag);
        const innerGlow      = this._compileProgram(cvQuadVert, cvInnerGlowFrag);
        const layer          = this._compileProgram(cvQuadVert, cvLayerFrag);
        const overlayBlend   = this._compileProgram(cvQuadVert, cvOverlayBlendFrag);
        const hardlightBlend = this._compileProgram(cvQuadVert, cvHardlightBlendFrag);

        return {
            kawaseDown: {
                prog:  kawaseDown,
                u_tex: this._loc(kawaseDown, 'u_tex'),
                u_rcp: this._loc(kawaseDown, 'u_rcp'),
                u_off: this._loc(kawaseDown, 'u_off'),
            },
            kawaseUp: {
                prog:  kawaseUp,
                u_tex: this._loc(kawaseUp, 'u_tex'),
                u_rcp: this._loc(kawaseUp, 'u_rcp'),
                u_off: this._loc(kawaseUp, 'u_off'),
            },
            shadow: {
                prog:       shadow,
                u_tex:      this._loc(shadow, 'u_tex'),
                u_color:    this._loc(shadow, 'u_color'),
                u_strength: this._loc(shadow, 'u_strength'),
                u_offset:   this._loc(shadow, 'u_offset'),
            },
            innerGlow: {
                prog:       innerGlow,
                u_blurTex:  this._loc(innerGlow, 'u_blurTex'),
                u_layerTex: this._loc(innerGlow, 'u_layerTex'),
                u_color:    this._loc(innerGlow, 'u_color'),
                u_strength: this._loc(innerGlow, 'u_strength'),
            },
            layer: {
                prog:      layer,
                u_tex:     this._loc(layer, 'u_tex'),
                u_opacity: this._loc(layer, 'u_opacity'),
            },
            overlayBlend: {
                prog:    overlayBlend,
                u_layer: this._loc(overlayBlend, 'u_layer'),
                u_bg:    this._loc(overlayBlend, 'u_bg'),
            },
            hardlightBlend: {
                prog:    hardlightBlend,
                u_layer: this._loc(hardlightBlend, 'u_layer'),
                u_bg:    this._loc(hardlightBlend, 'u_bg'),
            },
        };
    }

    /** Compiles + links a VS/FS pair.  Throws on any error. */
    private _compileProgram(vertSrc: string, fragSrc: string): WebGLProgram {
        const gl = this._gl;

        const vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, vertSrc);
        gl.compileShader(vs);
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
            throw new Error(`[CV-EFFECTS] VS compile error: ${gl.getShaderInfoLog(vs)}`);
        }

        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, fragSrc);
        gl.compileShader(fs);
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
            throw new Error(`[CV-EFFECTS] FS compile error: ${gl.getShaderInfoLog(fs)}`);
        }

        const prog = gl.createProgram();
        // Bind attribute locations before linking so all programs share the same layout
        gl.bindAttribLocation(prog, 0, 'a_pos');
        gl.bindAttribLocation(prog, 1, 'a_uv');
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            throw new Error(`[CV-EFFECTS] Program link error: ${gl.getProgramInfoLog(prog)}`);
        }
        // Shaders are no longer needed after linking
        gl.detachShader(prog, vs);
        gl.detachShader(prog, fs);
        gl.deleteShader(vs);
        gl.deleteShader(fs);

        return prog;
    }

    /** Helper: gets a required uniform location (warns if missing). */
    private _loc(prog: WebGLProgram, name: string): WebGLUniformLocation {
        const loc = this._gl.getUniformLocation(prog, name);
        if (loc === null) {
            console.warn(`[CV-EFFECTS] Uniform not found: ${name}`);
        }
        return loc;
    }
}
