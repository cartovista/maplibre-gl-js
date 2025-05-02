import {Color} from '@maplibre/maplibre-gl-style-spec';
import {DepthMode} from '../gl/depth_mode';
import {CullFaceMode} from '../gl/cull_face_mode';
import {ColorMode} from '../gl/color_mode';
import {
    fillUniformValues,
    fillPatternUniformValues,
    fillOutlineUniformValues,
    fillOutlinePatternUniformValues,
    //CartoVista - Added Support for Blend Modes - Begin
    fillBlendUniformValues,
    fillBlendUniforms,
    fillGradientUniforms,
    fillGradientUniformValues
    //CartoVista - Added Support for Blend Modes - End
} from './program/fill_program';

import type {Painter} from './painter';
import type {SourceCache} from '../source/source_cache';
import type {FillStyleLayer} from '../style/style_layer/fill_style_layer';
import type {FillBucket} from '../data/bucket/fill_bucket';
import type {OverscaledTileID} from '../source/tile_id';
import type {ProgramConfigurationSet} from '../data/program_configuration';

import {updatePatternPositionsInProgram} from './update_pattern_positions_in_program';
import {SegmentVector} from '../data/segment';
import {FeaturePositionMap} from '../data/feature_position_map';
import murmur3 from 'murmurhash-js';

export function drawFill(painter: Painter, sourceCache: SourceCache, layer: FillStyleLayer, coords: Array<OverscaledTileID>) {
    const color = layer.paint.get('fill-color');
    const opacity = layer.paint.get('fill-opacity');
    //console.log('drawFill is called...');

    if (opacity.constantOr(1) === 0) {
        return;
    }

    const colorMode = painter.colorModeForRenderPass();

    const pattern = layer.paint.get('fill-pattern');
    const pass = painter.opaquePassEnabledForLayer() &&
        (!pattern.constantOr(1 as any) &&
            color.constantOr(Color.transparent).a === 1 &&
            opacity.constantOr(0) === 1) ? 'opaque' : 'translucent';

    // Draw fill
    if (painter.renderPass === pass) {
        const depthMode = painter.depthModeForSublayer(
            1, painter.renderPass === 'opaque' ? DepthMode.ReadWrite : DepthMode.ReadOnly);
        drawFillTiles(painter, sourceCache, layer, coords, depthMode, colorMode, false);
    }

    // Draw stroke
    if (painter.renderPass === 'translucent' && layer.paint.get('fill-antialias')) {

        // If we defined a different color for the fill outline, we are
        // going to ignore the bits in 0x07 and just care about the global
        // clipping mask.
        // Otherwise, we only want to drawFill the antialiased parts that are
        // *outside* the current shape. This is important in case the fill
        // or stroke color is translucent. If we wouldn't clip to outside
        // the current shape, some pixels from the outline stroke overlapped
        // the (non-antialiased) fill.
        const depthMode = painter.depthModeForSublayer(
            layer.getPaintProperty('fill-outline-color') ? 2 : 0, DepthMode.ReadOnly);
        drawFillTiles(painter, sourceCache, layer, coords, depthMode, colorMode, true);
    }
}

function drawFillTiles(
    painter: Painter,
    sourceCache: SourceCache,
    layer: FillStyleLayer,
    coords: Array<OverscaledTileID>,
    depthMode: Readonly<DepthMode>,
    colorMode: Readonly<ColorMode>,
    isOutline: boolean) {
    const gl = painter.context.gl;
    const fillPropertyName = 'fill-pattern';
    const patternProperty = layer.paint.get(fillPropertyName);
    const gradientType = layer.paint.get('fill-gradient-type');
    const gradientStartColor = layer.paint.get('fill-gradient-start-color').constantOr(Color.red);
    const gradientEndColor = layer.paint.get('fill-gradient-end-color').constantOr(Color.white);
    const image = patternProperty && patternProperty.constantOr(1 as any);
    const crossfade = layer.getCrossfadeParameters();
    let drawMode, programName, uniformValues, indexBuffer, segments;

    const globalFeatureBounds: Record<string | number, {min: [number, number]; max: [number, number]}> = {};

    if (!isOutline) {
        //CartoVista - Added Support for Blend Modes - Begin
        //const blendMode = layer.blendMode;
        //programName = (blendMode === 'HARDLIGHT' || blendMode === 'OVERLAY') ? 'fillBlend' : image ? 'fillPattern' : 'fill';
        programName = image ? 'fillPattern' : 'fill';
        //CartoVista - Added Support for Blend Modes - End
        drawMode = gl.TRIANGLES;
        if (gradientType === 'linear' || gradientType === 'radial') {
            programName = 'fillGradient';
        }

    } else {
        programName = image && !layer.getPaintProperty('fill-outline-color') ? 'fillOutlinePattern' : 'fillOutline';
        drawMode = gl.LINES;
    }

    console.log('programName', programName);

    if (programName === 'fillGradient') {
        // === First pass: compute global feature bounds
        for (const coord of coords) {
            const tile = sourceCache.getTile(coord);
            const bucket = tile.getBucket(layer) as FillBucket;
            if (!bucket) continue;

            for (const featureInfo of bucket.featureDrawInfos) {
                const id = featureInfo.featureId;
                if (id == null) continue;

                if (!globalFeatureBounds[id]) {
                    globalFeatureBounds[id] = {
                        min: [...featureInfo.boundsMin],
                        max: [...featureInfo.boundsMax]
                    };
                } else {
                    const g = globalFeatureBounds[id];
                    g.min[0] = Math.min(g.min[0], featureInfo.boundsMin[0]);
                    g.min[1] = Math.min(g.min[1], featureInfo.boundsMin[1]);
                    g.max[0] = Math.max(g.max[0], featureInfo.boundsMax[0]);
                    g.max[1] = Math.max(g.max[1], featureInfo.boundsMax[1]);
                }
            }
        }
    }

    const constantPattern = patternProperty.constantOr(null);

    for (const coord of coords) {
        const tile = sourceCache.getTile(coord);

        if (image && !tile.patternsLoaded()) continue;

        const bucket: FillBucket = (tile.getBucket(layer) as any);

        if (!bucket) continue;

        const programConfiguration = bucket.programConfigurations.get(layer.id);

        const program = painter.useProgram(programName, programConfiguration);
        //const program = painter.useProgram('fill', programConfiguration); // pretend it's "fill" for now

        const terrainData = painter.style.map.terrain && painter.style.map.terrain.getTerrainData(coord);

        if (image) {
            painter.context.activeTexture.set(gl.TEXTURE0);
            tile.imageAtlasTexture.bind(gl.LINEAR, gl.CLAMP_TO_EDGE);
            programConfiguration.updatePaintBuffers(crossfade);
        }

        updatePatternPositionsInProgram(programConfiguration, fillPropertyName, constantPattern, tile, layer);

        const terrainCoord = terrainData ? coord : null;
        const posMatrix = terrainCoord ? terrainCoord.posMatrix : coord.posMatrix;
        const tileMatrix = painter.translatePosMatrix(posMatrix, tile,
            layer.paint.get('fill-translate'), layer.paint.get('fill-translate-anchor'));
        let startColor;
        let endColor;

        if (!isOutline) {
            indexBuffer = bucket.indexBuffer;
            segments = bucket.segments;

            if (programName === 'fillBlend') {
                uniformValues = image ?
                    fillPatternUniformValues(tileMatrix, painter, crossfade, tile) :
                    fillBlendUniformValues(tileMatrix);
            } else if (programName === 'fillGradient') {
                startColor = gradientStartColor ? {
                    r: gradientStartColor.r,
                    g: gradientStartColor.g,
                    b: gradientStartColor.b,
                    a: gradientStartColor.a
                } : {r: 0, g: 0, b: 0, a: 1};

                endColor = gradientEndColor ? {
                    r: gradientEndColor.r,
                    g: gradientEndColor.g,
                    b: gradientEndColor.b,
                    a: gradientEndColor.a
                } : {r: 1, g: 1, b: 1, a: 1};

            } else {
                uniformValues = image ?
                    fillPatternUniformValues(tileMatrix, painter, crossfade, tile) :
                    fillUniformValues(tileMatrix);
            }

        } else {
            indexBuffer = bucket.indexBuffer2;
            segments = bucket.segments2;
            const drawingBufferSize = [gl.drawingBufferWidth, gl.drawingBufferHeight] as [number, number];
            uniformValues = (programName === 'fillOutlinePattern' && image) ?
                fillOutlinePatternUniformValues(tileMatrix, painter, crossfade, tile, drawingBufferSize) :
                fillOutlineUniformValues(tileMatrix, drawingBufferSize);
        }

        //CartoVista - Added Support for Blend Modes - Begin
        if (layer.blendMode === 'MULTIPLY') {
            gl.enable(gl.BLEND);

            // Set the blend function to Multiply
            //gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA);
        }  else if (layer.blendMode === 'SCREEN') {
            gl.enable(gl.BLEND);

            // Set the blend function to Screen
            //gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
        }  else if (layer.blendMode === 'LIGHTEN') {
            gl.enable(gl.BLEND);

            // Set the blend function to Lighten
            //gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.blendFunc(gl.ONE, gl.ONE);
        }
        //CartoVista - Added Support for Blend Modes - End

        if (programName === 'fillGradient') {
            // Before drawing gradient
            if (painter.renderPass !== 'translucent') {
                return;
            }
            console.log(programConfiguration);
            for (const featureInfo of bucket.featureDrawInfos) {

                //console.log('Drawing fillGradient ', bucket.featureDrawInfos);

                //const featureInfo = bucket.featureDrawInfos[0]; // <-- first feature

                //if (featureInfo) {
                // Set per-feature uniforms
                //uniformValues['u_bounds_min'].set(featureInfo.boundsMin[0], featureInfo.boundsMin[1]);
                //uniformValues['u_bounds_max'].set(featureInfo.boundsMax[0], featureInfo.boundsMax[1]);
                //console.log('bucket.globalFeatureBounds', globalFeatureBounds);
                //const bounds = globalFeatureBounds[featureInfo.featureId];

                uniformValues = fillGradientUniformValues(tileMatrix, [featureInfo.boundsMin[0], featureInfo.boundsMin[1]], [featureInfo.boundsMax[0], featureInfo.boundsMax[1]], [startColor.r, startColor.g, startColor.b, startColor.a], [endColor.r, endColor.g, endColor.b, endColor.a], 1);

                console.log('featureId=', featureInfo.featureId);

                const programConfigurationSet: ProgramConfigurationSet<FillStyleLayer> = bucket.programConfigurations;

                console.log('programConfigurationSet=', programConfigurationSet);
                // Create a temporary SegmentVector for the single feature
                //const singleFeatureSegments = createSingleFeatureSegment(bucket, featureInfo.featureId, programConfigurationSet, bucket.indexArray.length);
                const singleFeatureSegments = createSingleFeatureSegment2(featureInfo);

                console.log('singleFeatureSegments=', singleFeatureSegments);

                console.log('🧩 FeatureDrawInfo', {
                    featureId: featureInfo.featureId,
                    vertexOffset: featureInfo.vertexOffset,
                    vertexLength: featureInfo.vertexLength,
                    indexOffset: featureInfo.indexOffset,
                    indexLength: featureInfo.indexLength,
                    primitiveOffset: featureInfo.indexOffset / 3,
                    primitiveLength: featureInfo.indexLength / 3
                });

                console.log('Feature ID', featureInfo.featureId, 'SingleFeatureSegment:', singleFeatureSegments);

                const totalIndices = bucket.indexArray.length;

                const totalIndicesInElements = totalIndices * 3;

                if ((featureInfo.indexOffset + featureInfo.indexLength) > totalIndicesInElements) {
                    console.warn(`[Draw] Invalid draw range for featureId=${featureInfo.featureId}`, {
                        indexOffset: featureInfo.indexOffset,
                        indexLength: featureInfo.indexLength,
                        totalIndices: totalIndicesInElements
                    });
                }

                // Validate buffer bounds
                const vertexEnd = featureInfo.vertexOffset + featureInfo.vertexLength;
                const indexEnd = featureInfo.indexOffset + featureInfo.indexLength;
                const vertexArrayLen = bucket.layoutVertexArray.length;
                const indexArrayLen = bucket.indexArray.length;

                if (vertexEnd > vertexArrayLen || indexEnd > indexArrayLen) {
                    console.error(`❌ DrawInfo exceeds buffer bounds for featureId=${featureInfo.featureId}`, {
                        vertexEnd,
                        vertexArrayLen,
                        indexEnd,
                        indexArrayLen
                    });
                    return;
                }

                // Draw only that feature
                program.draw(
                    painter.context,
                    drawMode,
                    depthMode,
                    painter.stencilModeForClipping(coord),
                    colorMode,
                    CullFaceMode.disabled,
                    uniformValues,
                    terrainData,
                    layer.id,
                    bucket.layoutVertexBuffer,
                    indexBuffer,
                    singleFeatureSegments,
                    layer.paint,
                    painter.transform.zoom,
                    programConfiguration
                );
            }

        } else {
            // Normal case: no special feature-based drawing needed
            console.log('normal fill...');
            const programConfigurationSet: ProgramConfigurationSet<FillStyleLayer> = bucket.programConfigurations;
            console.log('segments=', segments);

            console.log('programConfigurationSet=', programConfigurationSet);
            program.draw(painter.context, drawMode, depthMode,
                painter.stencilModeForClipping(coord), colorMode, CullFaceMode.disabled,
                uniformValues, terrainData,
                layer.id, bucket.layoutVertexBuffer, indexBuffer, segments,
                layer.paint, painter.transform.zoom, programConfiguration);
        }
        //CartoVista - Added Support for Blend Modes - Begin
        // Disable blending after drawing
        if (layer.blendMode === 'MULTIPLY' || layer.blendMode === 'SCREEN' || layer.blendMode === 'LIGHTEN') {
            gl.disable(gl.BLEND);
        }
        //CartoVista - Added Support for Blend Modes - End
    }

    function createSingleFeatureSegment2(featureInfo: {
        vertexOffset: number;
        indexOffset: number;
        indexLength: number;
        vertexLength: number;
    }): SegmentVector {
        const segmentVector = new SegmentVector();
        segmentVector.segments.push({
            vertexOffset: featureInfo.vertexOffset,
            primitiveOffset: featureInfo.indexOffset / 3,   // Convert from indices to triangles
            vertexLength: featureInfo.vertexLength,
            primitiveLength: featureInfo.indexLength / 3
        } as any);
        return segmentVector;
    }

    function createSingleFeatureSegment(
        bucket: FillBucket,
        featureId: any,
        programConfig: ProgramConfigurationSet<FillStyleLayer>,
        totalIndexCount: number
    ): SegmentVector {
        const segmentVector = new SegmentVector();
        const featureMap = (programConfig as any)._featureMap;

        const internalNumericId = murmur3(featureId);
        const position = getFeaturePositionsById(featureMap, internalNumericId);

        if (!position || position.length === 0) {
            console.warn(`❌ No feature match for ID ${featureId}`);
            return segmentVector;
        }

        // Correct order: vertexOffset, primitiveOffset (indexOffset), vertexLength
        const [vertexOffset, primitiveOffset, vertexLength] = position[0] as [number, number, number];

        const nextOffset = totalIndexCount; // assume last feature, fallback
        const primitiveLength = (nextOffset - primitiveOffset);

        segmentVector.segments.push({
            vertexOffset,
            primitiveOffset: primitiveOffset / 3,
            vertexLength,
            primitiveLength
        } as any);

        return segmentVector;
    }
    function getFeaturePositionsById(
        featureMap: { ids: Float64Array; positions: Uint32Array },
        featureId: number
    ): number[][] {
        const ids = featureMap.ids;
        const positions = featureMap.positions;
        const result: number[][] = [];

        for (let i = 0; i < ids.length; i++) {
            if (ids[i] === featureId) {
                const base = i * 3;
                result.push([
                    positions[base],      // vertexOffset
                    positions[base + 1],  // primitiveOffset (indexOffset)
                    positions[base + 2]   // vertexLength
                ]);
            }
        }

        return result;
    }

    /**
 * Computes bounds for a single feature in a FillBucket using FeaturePositionMap.
 * @param bucket The FillBucket instance.
 * @param featureId The feature's string ID.
 * @returns [[minX, minY], [maxX, maxY]] or null if not found.
 */
    function getFeatureBoundsFromBucket(bucket: any, featureId: string): [[number, number], [number, number]] | null {
        const programConfig = bucket.programConfigurations;
        const featureMap = (programConfig as any)._featureMap;

        if (!featureMap || !featureMap.ids || !featureMap.positions) {
            console.warn('Feature map is not available on bucket');
            return null;
        }

        const internalId = murmur3(featureId);
        const ids = featureMap.ids;
        const positions = featureMap.positions;

        let foundIndex = -1;
        for (let i = 0; i < ids.length; i++) {
            if (ids[i] === internalId) {
                foundIndex = i;
                break;
            }
        }

        if (foundIndex === -1) {
            console.warn(`Feature ID ${featureId} not found in FeaturePositionMap`);
            return null;
        }

        const vertexOffset = positions[foundIndex * 3 + 1];
        const vertexLength = positions[foundIndex * 3 + 2];

        return computeBoundsFromLayout(bucket.layoutVertexArray, vertexOffset, vertexLength);
    }

    function computeBoundsFromLayout(
        layout: any,
        vertexOffset: number,
        vertexLength: number
    ): [[number, number], [number, number]] {
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        for (let i = vertexOffset; i < vertexOffset + vertexLength; i++) {
            const vertex = layout.get(i);
            const x = vertex.a0;
            const y = vertex.a1;

            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        }

        return [[minX, minY], [maxX, maxY]];
    }

}
