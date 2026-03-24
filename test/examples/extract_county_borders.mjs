/**
 * Converts counties-us.geojson (Polygon/MultiPolygon features) into a
 * county-borders.geojson file of LineString features.
 *
 * Shared edges between adjacent counties are de-duplicated by normalising
 * each segment so the vertex with the smaller coordinate comes first, then
 * collecting only unique segments.  The resulting LineStrings are
 * "stitched" back into the longest possible chains to minimise feature count.
 *
 * Usage: node extract_county_borders.mjs
 */

import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── 1. Load source ───────────────────────────────────────────────────────────

const src = JSON.parse(fs.readFileSync(path.join(__dirname, 'counties-us.geojson'), 'utf8'));

// ── 2. Collect all polygon rings ─────────────────────────────────────────────

function* rings(geom) {
    if (geom.type === 'Polygon') {
        yield* geom.coordinates;
    } else if (geom.type === 'MultiPolygon') {
        for (const poly of geom.coordinates)
            yield* poly;
    }
}

// ── 3. De-duplicate segments ─────────────────────────────────────────────────

// Key a segment so order doesn't matter: normalise so the "smaller" coord
// comes first (lexicographic on [lng, lat]).
function segKey(a, b) {
    const ak = `${a[0]},${a[1]}`;
    const bk = `${b[0]},${b[1]}`;
    return ak < bk ? `${ak}|${bk}` : `${bk}|${ak}`;
}

const seen = new Set();   // deduplicate shared borders
const segments = [];      // unique segments as [[x0,y0],[x1,y1]]

for (const feature of src.features) {
    for (const ring of rings(feature.geometry)) {
        for (let i = 0; i < ring.length - 1; i++) {
            const a = ring[i], b = ring[i + 1];
            const k = segKey(a, b);
            if (!seen.has(k)) {
                seen.add(k);
                segments.push([a, b]);
            }
        }
    }
}

console.log(`Unique boundary segments: ${segments.length}`);

// ── 4. Stitch segments into polylines ────────────────────────────────────────
// Build an adjacency map: endpoint → list of segment indices that touch it.

function ptKey(p) { return `${p[0]},${p[1]}`; }

const adj = new Map();   // ptKey → [segIdx, ...]

function addAdj(pt, idx) {
    const k = ptKey(pt);
    if (!adj.has(k)) adj.set(k, []);
    adj.get(k).push(idx);
}

for (let i = 0; i < segments.length; i++) {
    addAdj(segments[i][0], i);
    addAdj(segments[i][1], i);
}

const used = new Uint8Array(segments.length);
const lines = [];

for (let start = 0; start < segments.length; start++) {
    if (used[start]) continue;

    // Walk forward from the end of this segment as far as possible.
    const chain = [...segments[start]];
    used[start] = 1;

    let tip = chain[chain.length - 1];
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const neighbours = adj.get(ptKey(tip)) || [];
        const next = neighbours.find(idx => !used[idx]);
        if (next === undefined) break;
        used[next] = 1;
        // Append the OTHER endpoint of this segment.
        const [sa, sb] = segments[next];
        chain.push(ptKey(sa) === ptKey(tip) ? sb : sa);
        tip = chain[chain.length - 1];
    }

    lines.push(chain);
}

console.log(`LineString features: ${lines.length}`);

// ── 5. Write output ──────────────────────────────────────────────────────────

const out = {
    type: 'FeatureCollection',
    features: lines.map(coords => ({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: {}
    }))
};

const outPath = path.join(__dirname, 'county-borders.geojson');
fs.writeFileSync(outPath, JSON.stringify(out));
console.log(`Written: ${outPath}`);
