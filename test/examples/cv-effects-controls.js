/**
 * cv-effects-controls.js
 * Shared panel UI helper for cv-effects testbed pages.
 * Dark slate design matches the cartovista-basemap project.
 */

// ─── Module state ─────────────────────────────────────────────────────────────

let _map = null;
let _layers = [];
let _selectedId = null;
let _layerListEl = null;
let _propContentEl = null;
let _savedEffectValues = null;

// ─── CSS ──────────────────────────────────────────────────────────────────────

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');

*, *::before, *::after { box-sizing: border-box; }

html, body {
  margin: 0;
  height: 100%;
  overflow: hidden;
  font-family: 'Poppins', system-ui, -apple-system, sans-serif;
  background: #0f172a;
  color: #e2e8f0;
}

#cv-app {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

/* ── Panels ── */
.cv-panel {
  background: #0f172a;
  display: flex;
  flex-direction: column;
  height: 100%;
  flex-shrink: 0;
}

.cv-panel--left  { width: 220px; border-right: 1px solid #334155; }
.cv-panel--right { width: 300px; border-left:  1px solid #334155; }

.cv-panel__header {
  padding: 14px 16px;
  border-bottom: 1px solid #334155;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.cv-panel__header h2 {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  color: #e2e8f0;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.cv-panel__content {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.cv-panel--right .cv-panel__content { padding: 0; }

.cv-panel__content::-webkit-scrollbar          { width: 6px; }
.cv-panel__content::-webkit-scrollbar-track    { background: #0f172a; }
.cv-panel__content::-webkit-scrollbar-thumb    { background: #334155; border-radius: 10px; }
.cv-panel__content::-webkit-scrollbar-thumb:hover { background: #475569; }

/* ── Map ── */
#cv-map {
  flex: 1;
  min-width: 0;
  position: relative;
}

/* ── Layer items ── */
.cv-layer-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  color: #e2e8f0;
  user-select: none;
  transition: background 0.15s;
  border-right: 3px solid transparent;
}

.cv-layer-item:hover { background: #1e293b; }
.cv-layer-item--selected { background: #1e293b; border-right-color: #3b82f6; }

.cv-layer-item__icon {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cv-layer-item__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cv-layer-item__eye {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #3b82f6;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.cv-layer-item__eye:hover     { background: #334155; }
.cv-layer-item__eye--hidden   { color: #475569; }

/* ── Property panel ── */
.cv-prop-placeholder {
  padding: 24px 16px;
  text-align: center;
  font-size: 12px;
  color: #64748b;
}

.cv-prop-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid #334155;
  flex-shrink: 0;
}

.cv-prop-header__name {
  font-size: 13px;
  font-weight: 600;
  color: #e2e8f0;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Collapsible sections ── */
.cv-section { border-bottom: 1px solid #334155; }

.cv-section__toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 16px;
  background: transparent;
  border: none;
  color: #e2e8f0;
  font-size: 10px;
  font-weight: 700;
  font-family: inherit;
  text-align: left;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: background 0.15s;
}

.cv-section__toggle:hover { background: rgba(30,41,59,0.5); }

.cv-section__icon {
  flex-shrink: 0;
  color: #94a3b8;
  display: flex;
  align-items: center;
}

.cv-section__title  { flex: 1; }

.cv-section__chevron {
  flex-shrink: 0;
  color: #64748b;
  display: flex;
  align-items: center;
  transition: transform 0.2s;
}

.cv-section__chevron--open { transform: rotate(180deg); }

.cv-section__content {
  padding: 8px 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ── Property rows ── */
.cv-prop-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cv-prop-label {
  font-size: 10px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.cv-prop-ctrl {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.cv-prop-slider {
  flex: 1;
  height: 6px;
  -webkit-appearance: none;
  appearance: none;
  background: #334155;
  border-radius: 3px;
  cursor: pointer;
  min-width: 0;
}

.cv-prop-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #3b82f6;
  cursor: pointer;
  border: 2px solid #0f172a;
}

.cv-prop-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #3b82f6;
  cursor: pointer;
  border: 2px solid #0f172a;
  box-sizing: border-box;
}

.cv-prop-value {
  flex-shrink: 0;
  font-size: 10px;
  font-family: ui-monospace, monospace;
  color: #94a3b8;
  min-width: 48px;
  text-align: right;
}

.cv-prop-color {
  width: 32px;
  height: 22px;
  border-radius: 4px;
  border: 1px solid #334155;
  cursor: pointer;
  padding: 2px;
  background: transparent;
  flex-shrink: 0;
}
.cv-prop-color::-webkit-color-swatch-wrapper { padding: 0; }
.cv-prop-color::-webkit-color-swatch { border: none; border-radius: 3px; }

.cv-prop-select {
  width: 100%;
  padding: 6px 28px 6px 10px;
  font-size: 12px;
  font-family: inherit;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 6px;
  color: #e2e8f0;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  cursor: pointer;
}

.cv-prop-select:focus { outline: none; border-color: #3b82f6; }

.cv-prop-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 12px;
  color: #e2e8f0;
  user-select: none;
}

.cv-prop-toggle input[type=checkbox] {
  width: 14px;
  height: 14px;
  accent-color: #3b82f6;
  cursor: pointer;
  flex-shrink: 0;
}

/* ── Expr badge ── */
.cv-prop-label--expr { color: #475569; }
.cv-prop-label--expr::after { content: ' (expr)'; font-size: 9px; color: #334155; }

.cv-prop-expr-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 10px;
  font-size: 10px;
  font-family: ui-monospace, monospace;
  color: #475569;
  user-select: none;
}

/* ── FPS overlay ── */
.cv-fps {
  position: fixed;
  bottom: 8px;
  right: 8px;
  background: rgba(15,23,42,0.85);
  border: 1px solid #334155;
  color: #e2e8f0;
  font: 11px ui-monospace, monospace;
  padding: 4px 8px;
  border-radius: 4px;
  z-index: 999;
  pointer-events: none;
}

/* ── Baseline toggle ── */
.cv-baseline-btn {
  position: fixed;
  bottom: 8px;
  left: 228px;
  background: rgba(15,23,42,0.85);
  border: 1px solid #334155;
  color: #e2e8f0;
  font: 11px ui-monospace, monospace;
  padding: 4px 8px;
  border-radius: 4px;
  z-index: 999;
  cursor: pointer;
  transition: background 0.2s;
}
.cv-baseline-btn:hover { background: #1e293b; }
`;

// ─── Inline SVG icons ─────────────────────────────────────────────────────────

function _layerIcon(type) {
    const map = {
        fill:            `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" fill="#3b82f6" opacity="0.85"/></svg>`,
        line:            `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 14L14 2" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round"/></svg>`,
        circle:          `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" fill="#3b82f6" opacity="0.85"/></svg>`,
        symbol:          `<svg width="16" height="16" viewBox="0 0 16 16"><text x="3" y="12" font-family="sans-serif" font-size="11" font-weight="700" fill="#3b82f6">A</text></svg>`,
        'fill-extrusion':`<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2L14 5V11L8 14L2 11V5Z" fill="#3b82f6" opacity="0.6"/><path d="M8 2L14 5L8 8L2 5Z" fill="#3b82f6" opacity="0.9"/></svg>`,
        heatmap:         `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" fill="url(#hg)"/><defs><radialGradient id="hg"><stop offset="0%" stop-color="#ef4444"/><stop offset="100%" stop-color="#3b82f6" stop-opacity="0.1"/></radialGradient></defs></svg>`,
        raster:          `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="1" stroke="#3b82f6" stroke-width="1.5" fill="none"/><path d="M2 7h12M7 2v12" stroke="#3b82f6" stroke-width="1" opacity="0.4"/></svg>`,
    };
    return map[type] ?? map.fill;
}

const _iconPaint    = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L3 14.67V21h6.33l10.06-10.06a5.5 5.5 0 000-7.78z"/><line x1="18" y1="11.5" x2="12" y2="5.5"/></svg>`;
const _iconEyeOpen   = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const _iconEyeClosed = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
const _iconChevron   = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>`;
const _iconBlend     = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="12" r="5" opacity="0.7"/><circle cx="15" cy="12" r="5" opacity="0.7"/></svg>`;
const _iconShadow    = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="12" height="12" rx="2"/><rect x="9" y="9" width="12" height="12" rx="2" opacity="0.35" stroke-dasharray="3 2"/></svg>`;
const _iconGlow      = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="8" opacity="0.4" stroke-dasharray="2 2"/></svg>`;

// ─── Paint property schema (per layer type) ───────────────────────────────────

const PAINT_SCHEMA = {
    fill: [
        { key: 'fill-color',   ctrl: 'color',  label: 'Fill Color', fallback: '#4a90d9' },
        { key: 'fill-opacity', ctrl: 'slider', label: 'Opacity', fallback: 1, min: 0, max: 1, step: 0.01 },
    ],
    line: [
        { key: 'line-color',     ctrl: 'color',  label: 'Color',     fallback: '#4a90d9' },
        { key: 'line-width',     ctrl: 'slider', label: 'Width',     fallback: 1,   min: 0, max: 24,  step: 0.5, suffix: 'px' },
        { key: 'line-gap-width', ctrl: 'slider', label: 'Gap Width', fallback: 0,   min: 0, max: 20,  step: 0.5, suffix: 'px' },
        { key: 'line-opacity',   ctrl: 'slider', label: 'Opacity',   fallback: 1,   min: 0, max: 1,   step: 0.01 },
    ],
    circle: [
        { key: 'circle-color',           ctrl: 'color',  label: 'Fill Color',    fallback: '#4a90d9' },
        { key: 'circle-radius',          ctrl: 'slider', label: 'Radius',        fallback: 5,  min: 0, max: 50, step: 0.5, suffix: 'px' },
        { key: 'circle-opacity',         ctrl: 'slider', label: 'Opacity',       fallback: 1,  min: 0, max: 1,  step: 0.01 },
        { key: 'circle-stroke-color',    ctrl: 'color',  label: 'Stroke Color',  fallback: '#ffffff' },
        { key: 'circle-stroke-width',    ctrl: 'slider', label: 'Stroke Width',  fallback: 0,  min: 0, max: 20, step: 0.5, suffix: 'px' },
        { key: 'circle-stroke-opacity',  ctrl: 'slider', label: 'Stroke Opacity',fallback: 1,  min: 0, max: 1,  step: 0.01 },
    ],
    symbol: [
        { key: 'text-color',      ctrl: 'color',  label: 'Text Color',   fallback: '#ffffff' },
        { key: 'text-size',       ctrl: 'slider', label: 'Text Size',    fallback: 12, min: 1, max: 48, step: 1, suffix: 'px' },
        { key: 'text-opacity',    ctrl: 'slider', label: 'Text Opacity', fallback: 1,  min: 0, max: 1,  step: 0.01 },
        { key: 'text-halo-color', ctrl: 'color',  label: 'Halo Color',   fallback: '#000000' },
        { key: 'text-halo-width', ctrl: 'slider', label: 'Halo Width',   fallback: 0,  min: 0, max: 10, step: 0.5, suffix: 'px' },
        { key: 'icon-color',      ctrl: 'color',  label: 'Icon Color',   fallback: '#ffffff' },
        { key: 'icon-size',       ctrl: 'slider', label: 'Icon Size',    fallback: 1,  min: 0, max: 5,  step: 0.05 },
        { key: 'icon-opacity',    ctrl: 'slider', label: 'Icon Opacity', fallback: 1,  min: 0, max: 1,  step: 0.01 },
    ],
    'fill-extrusion': [
        { key: 'fill-extrusion-color',   ctrl: 'color',  label: 'Color',   fallback: '#4a90d9' },
        { key: 'fill-extrusion-opacity', ctrl: 'slider', label: 'Opacity', fallback: 1,  min: 0, max: 1,   step: 0.01 },
        { key: 'fill-extrusion-height',  ctrl: 'slider', label: 'Height',  fallback: 10, min: 0, max: 500, step: 1, suffix: 'm' },
        { key: 'fill-extrusion-base',    ctrl: 'slider', label: 'Base',    fallback: 0,  min: 0, max: 200, step: 1, suffix: 'm' },
    ],
    heatmap: [
        { key: 'heatmap-intensity', ctrl: 'slider', label: 'Intensity', fallback: 1,  min: 0, max: 5,   step: 0.05 },
        { key: 'heatmap-radius',    ctrl: 'slider', label: 'Radius',    fallback: 30, min: 1, max: 100, step: 1, suffix: 'px' },
        { key: 'heatmap-weight',    ctrl: 'slider', label: 'Weight',    fallback: 1,  min: 0, max: 5,   step: 0.05 },
        { key: 'heatmap-opacity',   ctrl: 'slider', label: 'Opacity',   fallback: 1,  min: 0, max: 1,   step: 0.01 },
    ],
    raster: [
        { key: 'raster-opacity',        ctrl: 'slider', label: 'Opacity',        fallback: 1,  min: 0,  max: 1,   step: 0.01 },
        { key: 'raster-brightness-min', ctrl: 'slider', label: 'Brightness Min', fallback: 0,  min: 0,  max: 1,   step: 0.01 },
        { key: 'raster-brightness-max', ctrl: 'slider', label: 'Brightness Max', fallback: 1,  min: 0,  max: 1,   step: 0.01 },
        { key: 'raster-saturation',     ctrl: 'slider', label: 'Saturation',     fallback: 0,  min: -1, max: 1,   step: 0.01 },
        { key: 'raster-contrast',       ctrl: 'slider', label: 'Contrast',       fallback: 0,  min: -1, max: 1,   step: 0.01 },
        { key: 'raster-hue-rotate',     ctrl: 'slider', label: 'Hue Rotate',     fallback: 0,  min: 0,  max: 360, step: 1, suffix: '°' },
    ],
};

const BLEND_OPTIONS = [
    ['normal','Normal'],['multiply','Multiply'],['screen','Screen'],
    ['add','Add'],['lighten','Lighten'],['overlay','Overlay'],['hardlight','Hard Light'],
];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Inject CSS into <head>. Safe to call multiple times.
 */
export function injectStyles() {
    if (document.getElementById('cv-effects-styles')) return;
    const el = document.createElement('style');
    el.id = 'cv-effects-styles';
    el.textContent = CSS;
    document.head.appendChild(el);
}

/**
 * Build the three-column shell (layer panel | map | property panel) and
 * append it to <body>. Returns { mapEl }.
 */
export function buildShell() {
    const app = document.createElement('div');
    app.id = 'cv-app';

    app.innerHTML = `
      <aside class="cv-panel cv-panel--left">
        <div class="cv-panel__header"><h2>Layers</h2></div>
        <div class="cv-panel__content" id="cv-layer-list"></div>
      </aside>
      <div id="cv-map"></div>
      <aside class="cv-panel cv-panel--right">
        <div class="cv-panel__header"><h2>Properties</h2></div>
        <div class="cv-panel__content" id="cv-prop-content">
          <p class="cv-prop-placeholder">Select a layer to configure its properties.</p>
        </div>
      </aside>
    `;

    document.body.appendChild(app);
    _layerListEl  = document.getElementById('cv-layer-list');
    _propContentEl = document.getElementById('cv-prop-content');
    return { mapEl: document.getElementById('cv-map') };
}

/**
 * Register layers with the panel system and render the layer list.
 *
 * Each layer object:
 * {
 *   id:       string           — MapLibre layer ID
 *   label:    string           — display name
 *   type:     string           — 'line' | 'circle' | 'symbol' | 'fill' | 'fill-extrusion' | 'heatmap' | 'raster'
 *   effects: {
 *     blend:     boolean
 *     shadow:    boolean
 *     outerGlow: boolean
 *     innerGlow: boolean
 *   }
 *   defaults: Record<string, any>   — initial cv-* paint property values
 * }
 */
export function initLayers(map, layers) {
    _map    = map;
    _layers = layers;
    _renderLayerList();
    if (layers.length > 0) _selectLayer(layers[0].id);
}

/**
 * Add a live FPS / status overlay in the bottom-right corner.
 */
export function addFpsCounter(map) {
    const el = document.createElement('div');
    el.className = 'cv-fps';
    el.textContent = 'Initialising…';
    document.body.appendChild(el);

    let frames = 0;
    let last = performance.now();
    map.on('render', () => {
        frames++;
        const now = performance.now();
        if (now - last >= 500) {
            el.textContent = `${(frames * 1000 / (now - last)).toFixed(1)} fps`;
            frames = 0;
            last = now;
        }
    });

    map.on('error', e => {
        el.style.background = 'rgba(200,0,0,.8)';
        el.textContent = 'Error: ' + (e.error?.message || 'unknown');
        console.error('MapLibre error:', e);
    });

    map.on('load', () => {
        el.textContent = 'Ready';
        map.repaint = true;
    });

    return el;
}

/**
 * Add an "Effects ON/OFF" baseline toggle button that disables all cv-* effects
 * at once (useful for comparing render cost with and without effects).
 */
export function addBaselineToggle(map, layerIds) {
    const EFFECT_PROPS = ['cv-shadow-enabled', 'cv-outer-glow-enabled', 'cv-inner-glow-enabled'];

    const btn = document.createElement('button');
    btn.className = 'cv-baseline-btn';
    btn.textContent = 'Effects: ON';
    document.body.appendChild(btn);

    let on = true;
    btn.addEventListener('click', () => {
        on = !on;
        btn.textContent = on ? 'Effects: ON' : 'Effects: OFF (baseline)';
        layerIds.forEach(id => {
            EFFECT_PROPS.forEach(prop => {
                try { map.setPaintProperty(id, prop, on ? (_savedEffectValues?.[id]?.[prop] ?? false) : false); }
                catch (_) {}
            });
        });
        if (!on) {
            // Save current values before disabling
            _savedEffectValues = {};
            layerIds.forEach(id => {
                _savedEffectValues[id] = {};
                EFFECT_PROPS.forEach(prop => {
                    try { _savedEffectValues[id][prop] = map.getPaintProperty(id, prop) ?? false; }
                    catch (_) { _savedEffectValues[id][prop] = false; }
                });
            });
        }
    });
}

// ─── Private: Layer list ──────────────────────────────────────────────────────

function _renderLayerList() {
    if (!_layerListEl) return;
    _layerListEl.innerHTML = '';
    _layers.forEach(layer => {
        const item = document.createElement('div');
        item.className = 'cv-layer-item';
        item.dataset.id = layer.id;
        item.innerHTML = `
          <div class="cv-layer-item__icon">${_layerIcon(layer.type)}</div>
          <span class="cv-layer-item__name">${layer.label}</span>
          <button class="cv-layer-item__eye" data-visible="true" title="Toggle visibility">${_iconEyeOpen}</button>
        `;

        item.addEventListener('click', e => {
            if (e.target.closest('.cv-layer-item__eye')) return;
            _selectLayer(layer.id);
        });

        const eye = item.querySelector('.cv-layer-item__eye');
        eye.addEventListener('click', () => {
            const vis = eye.dataset.visible === 'true';
            const next = !vis;
            eye.dataset.visible = String(next);
            eye.innerHTML = next ? _iconEyeOpen : _iconEyeClosed;
            eye.classList.toggle('cv-layer-item__eye--hidden', !next);
            _map.setLayoutProperty(layer.id, 'visibility', next ? 'visible' : 'none');
        });

        _layerListEl.appendChild(item);
    });
}

function _selectLayer(id) {
    _selectedId = id;
    _layerListEl.querySelectorAll('.cv-layer-item').forEach(el => {
        el.classList.toggle('cv-layer-item--selected', el.dataset.id === id);
    });
    _renderPropPanel(id);
}

// ─── Private: Property panel ──────────────────────────────────────────────────

function _renderPropPanel(layerId) {
    if (!_propContentEl) return;
    const layer = _layers.find(l => l.id === layerId);
    if (!layer) { _propContentEl.innerHTML = '<p class="cv-prop-placeholder">Layer not found.</p>'; return; }

    _propContentEl.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'cv-prop-header';
    header.innerHTML = `<div>${_layerIcon(layer.type)}</div><div class="cv-prop-header__name">${layer.label}</div>`;
    _propContentEl.appendChild(header);

    const d = layer.defaults || {};
    const { blend, shadow, outerGlow, innerGlow } = layer.effects;

    const paintSection = _buildPaintSection(layer);
    if (paintSection) _propContentEl.appendChild(paintSection);

    if (blend)     _propContentEl.appendChild(_buildBlendSection(layer, d));
    if (shadow)    _propContentEl.appendChild(_buildShadowSection(layer, d));
    if (outerGlow) _propContentEl.appendChild(_buildGlowSection(layer, d, 'outer'));
    if (innerGlow) _propContentEl.appendChild(_buildGlowSection(layer, d, 'inner'));

    if (!paintSection && !blend && !shadow && !outerGlow && !innerGlow) {
        const p = document.createElement('p');
        p.className = 'cv-prop-placeholder';
        p.textContent = 'No properties available for this layer. Use the eye icon to toggle visibility.';
        _propContentEl.appendChild(p);
    }
}

// ─── Private: Section builders ────────────────────────────────────────────────

function _buildCollapsible(id, title, iconSvg, open, fill) {
    const section = document.createElement('div');
    section.className = 'cv-section';
    let isOpen = open;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cv-section__toggle';
    btn.innerHTML = `
      <span class="cv-section__icon">${iconSvg}</span>
      <span class="cv-section__title">${title}</span>
      <span class="cv-section__chevron ${isOpen ? 'cv-section__chevron--open' : ''}">${_iconChevron}</span>
    `;

    const content = document.createElement('div');
    content.className = 'cv-section__content';
    content.style.display = isOpen ? '' : 'none';
    fill(content);

    btn.addEventListener('click', () => {
        isOpen = !isOpen;
        content.style.display = isOpen ? '' : 'none';
        btn.querySelector('.cv-section__chevron').classList.toggle('cv-section__chevron--open', isOpen);
    });

    section.appendChild(btn);
    section.appendChild(content);
    return section;
}

function _buildBlendSection(layer, d) {
    return _buildCollapsible(`${layer.id}-blend`, 'Blend Mode', _iconBlend, true, c => {
        c.appendChild(_selectRow('cv-blend-mode', layer.id, BLEND_OPTIONS, d['cv-blend-mode'] || 'normal'));
    });
}

function _buildShadowSection(layer, d) {
    const enabled = d['cv-shadow-enabled'] ?? false;
    return _buildCollapsible(`${layer.id}-shadow`, 'Drop Shadow', _iconShadow, enabled, c => {
        c.appendChild(_checkboxEl('Enabled', 'cv-shadow-enabled', layer.id, enabled));
        c.appendChild(_colorRowEl('Color',    'cv-shadow-color',    layer.id, d['cv-shadow-color']    || '#000000'));
        c.appendChild(_sliderRowEl('Size',     'cv-shadow-size',     layer.id, 0, 40, 1, d['cv-shadow-size']     ?? 6, 'px'));
        c.appendChild(_sliderRowEl('Distance', 'cv-shadow-distance', layer.id, 0, 40, 1, d['cv-shadow-distance'] ?? 4, 'px'));
        c.appendChild(_sliderRowEl('Angle',    'cv-shadow-angle',    layer.id, -180, 180, 1, d['cv-shadow-angle'] ?? 45, '°'));
        c.appendChild(_sliderRowEl('Opacity',  'cv-shadow-opacity',  layer.id, 0, 1, 0.01, d['cv-shadow-opacity'] ?? 0.5));
        c.appendChild(_sliderRowEl('Strength', 'cv-shadow-strength', layer.id, 0, 1000, 1, Math.round((d['cv-shadow-strength'] ?? 1) * 100), '%', 0.01));
    });
}

function _buildGlowSection(layer, d, which) {
    const isOuter = which === 'outer';
    const prefix  = isOuter ? 'cv-outer-glow' : 'cv-inner-glow';
    const title   = isOuter ? 'Outer Glow' : 'Inner Glow';
    const enabled = d[`${prefix}-enabled`] ?? false;
    const defColor = isOuter ? '#3b82f6' : '#ffffff';

    return _buildCollapsible(`${layer.id}-${which}glow`, title, _iconGlow, enabled, c => {
        c.appendChild(_checkboxEl('Enabled',  `${prefix}-enabled`,  layer.id, enabled));
        c.appendChild(_colorRowEl('Color',    `${prefix}-color`,    layer.id, d[`${prefix}-color`]    || defColor));
        c.appendChild(_sliderRowEl('Size',    `${prefix}-size`,     layer.id, 0, 40, 1, d[`${prefix}-size`]     ?? 7, 'px'));
        c.appendChild(_sliderRowEl('Opacity', `${prefix}-opacity`,  layer.id, 0, 1, 0.01, d[`${prefix}-opacity`] ?? 1.0));
        c.appendChild(_sliderRowEl('Strength',`${prefix}-strength`, layer.id, 0, 1000, 1, Math.round((d[`${prefix}-strength`] ?? 1) * 100), '%', 0.01));
    });
}

function _buildPaintSection(layer) {
    const schema = PAINT_SCHEMA[layer.type];
    if (!schema || schema.length === 0) return null;

    return _buildCollapsible(`${layer.id}-paint`, 'Paint', _iconPaint, true, c => {
        schema.forEach(({ key, ctrl, label, fallback, min, max, step, suffix }) => {
            const { value, isExpr } = _getPaintVal(layer.id, key);

            if (ctrl === 'color') {
                if (isExpr) {
                    // Multi-value expression — a single picker would be misleading
                    c.appendChild(_exprRowEl(label));
                } else {
                    const hex = _toHex(typeof value === 'string' ? value : null) ?? fallback ?? '#888888';
                    c.appendChild(_colorRowEl(label, key, layer.id, hex));
                }
            } else {
                // Sliders: use fallback for expression values but still allow override
                const numVal = (typeof value === 'number') ? value : fallback;
                c.appendChild(_sliderRowEl(label, key, layer.id, min, max, step, numVal, suffix ?? '', 1, isExpr));
            }
        });
    });
}

// ─── Private: UI element factories ───────────────────────────────────────────

function _exprRowEl(label) {
    const row = document.createElement('div');
    row.className = 'cv-prop-row';
    const lbl = document.createElement('div');
    lbl.className = 'cv-prop-label';
    lbl.textContent = label;
    const badge = document.createElement('span');
    badge.className = 'cv-prop-expr-badge';
    badge.textContent = 'expression';
    row.appendChild(lbl);
    row.appendChild(badge);
    return row;
}

function _sliderRowEl(label, paintProp, layerId, min, max, step, initVal, suffix = '', scale = 1, isExpr = false) {
    const row = document.createElement('div');
    row.className = 'cv-prop-row';

    const lbl = document.createElement('div');
    lbl.className = isExpr ? 'cv-prop-label cv-prop-label--expr' : 'cv-prop-label';
    lbl.textContent = label;

    const ctrl = document.createElement('div');
    ctrl.className = 'cv-prop-ctrl';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'cv-prop-slider';
    Object.assign(slider, { min, max, step, value: initVal });

    const valEl = document.createElement('span');
    valEl.className = 'cv-prop-value';
    valEl.textContent = _fmt(initVal, step) + suffix;

    slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        valEl.textContent = _fmt(v, step) + suffix;
        _map.setPaintProperty(layerId, paintProp, scale !== 1 ? v * scale : v);
    });

    ctrl.appendChild(slider);
    ctrl.appendChild(valEl);
    row.appendChild(lbl);
    row.appendChild(ctrl);
    return row;
}

function _colorRowEl(label, paintProp, layerId, initHex, isExpr = false) {
    const row = document.createElement('div');
    row.className = 'cv-prop-row';

    const lbl = document.createElement('div');
    lbl.className = isExpr ? 'cv-prop-label cv-prop-label--expr' : 'cv-prop-label';
    lbl.textContent = label;

    const ctrl = document.createElement('div');
    ctrl.className = 'cv-prop-ctrl';

    const input = document.createElement('input');
    input.type = 'color';
    input.className = 'cv-prop-color';
    input.value = initHex;

    const valEl = document.createElement('span');
    valEl.className = 'cv-prop-value';
    valEl.textContent = initHex;

    input.addEventListener('input', () => {
        valEl.textContent = input.value;
        _map.setPaintProperty(layerId, paintProp, input.value);
    });

    ctrl.appendChild(input);
    ctrl.appendChild(valEl);
    row.appendChild(lbl);
    row.appendChild(ctrl);
    return row;
}

function _checkboxEl(label, paintProp, layerId, initVal) {
    const wrap = document.createElement('label');
    wrap.className = 'cv-prop-toggle';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = initVal;
    cb.addEventListener('change', () => _map.setPaintProperty(layerId, paintProp, cb.checked));

    wrap.appendChild(cb);
    wrap.appendChild(document.createTextNode(label));
    return wrap;
}

function _selectRow(paintProp, layerId, options, initVal) {
    const sel = document.createElement('select');
    sel.className = 'cv-prop-select';
    options.forEach(([val, label]) => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = label;
        if (val === initVal) opt.selected = true;
        sel.appendChild(opt);
    });
    sel.addEventListener('change', () => _map.setPaintProperty(layerId, paintProp, sel.value));
    return sel;
}

function _fmt(v, step) {
    return step < 1 ? Number(v).toFixed(2) : String(Math.round(Number(v)));
}

function _toHex(color) {
    if (!color || typeof color !== 'string') return null;
    if (/^#[0-9a-f]{3,8}$/i.test(color)) {
        if (color.length === 4) return '#' + color[1]+color[1]+color[2]+color[2]+color[3]+color[3];
        return color.slice(0, 7);
    }
    const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) return '#' + [m[1],m[2],m[3]].map(n => (+n).toString(16).padStart(2,'0')).join('');
    return null;
}

function _getPaintVal(layerId, key) {
    try {
        const v = _map.getPaintProperty(layerId, key);
        if (v === undefined || v === null) return { value: undefined, isExpr: false };
        const isExpr = Array.isArray(v) || (typeof v === 'object' && v !== null);
        return { value: v, isExpr };
    } catch (_) {
        return { value: undefined, isExpr: false };
    }
}
