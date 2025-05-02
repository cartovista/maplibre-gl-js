import {patternUniformValues} from './pattern';
import {
    Uniform1i,
    Uniform1f,
    Uniform2f,
    Uniform3f,
    Uniform4f,
    UniformMatrix4f
} from '../uniform_binding';
import {extend} from '../../util/util';

import type {Painter} from '../painter';
import type {UniformValues, UniformLocations} from '../uniform_binding';
import type {Context} from '../../gl/context';
import type {CrossfadeParameters} from '../../style/evaluation_parameters';
import type {Tile} from '../../source/tile';
import {mat4} from 'gl-matrix';

export type FillUniformsType = {
    'u_matrix': UniformMatrix4f;
};

//CartoVista - Added Support for Blend Modes - Begin
export type FillBlendUniformsType = {
    'u_matrix': UniformMatrix4f;
};

//CartoVista - Added Support for Blend Modes - End

export type FillOutlineUniformsType = {
    'u_matrix': UniformMatrix4f;
    'u_world': Uniform2f;
};

export type FillPatternUniformsType = {
    'u_matrix': UniformMatrix4f;
    // pattern uniforms:
    'u_texsize': Uniform2f;
    'u_image': Uniform1i;
    'u_pixel_coord_upper': Uniform2f;
    'u_pixel_coord_lower': Uniform2f;
    'u_scale': Uniform3f;
    'u_fade': Uniform1f;
};

export type FillOutlinePatternUniformsType = {
    'u_matrix': UniformMatrix4f;
    'u_world': Uniform2f;
    // pattern uniforms:
    'u_texsize': Uniform2f;
    'u_image': Uniform1i;
    'u_pixel_coord_upper': Uniform2f;
    'u_pixel_coord_lower': Uniform2f;
    'u_scale': Uniform3f;
    'u_fade': Uniform1f;
};

const fillUniforms = (context: Context, locations: UniformLocations): FillUniformsType => ({
    'u_matrix': new UniformMatrix4f(context, locations.u_matrix)
});

export type FillGradientUniformsType = {
    'u_matrix': UniformMatrix4f;
    'u_bounds_min': Uniform2f;
    'u_bounds_max': Uniform2f;
    'u_opacity': Uniform1f;
    'u_color_start': Uniform4f;
    'u_color_end': Uniform4f;
};

//CartoVista - Added Support for Blend Modes - Begin
const fillBlendUniforms = (context: Context, locations: UniformLocations): FillBlendUniformsType => ({
    'u_matrix': new UniformMatrix4f(context, locations.u_matrix)
});//CartoVista - Added Support for Blend Modes - End

const fillPatternUniforms = (context: Context, locations: UniformLocations): FillPatternUniformsType => ({
    'u_matrix': new UniformMatrix4f(context, locations.u_matrix),
    'u_image': new Uniform1i(context, locations.u_image),
    'u_texsize': new Uniform2f(context, locations.u_texsize),
    'u_pixel_coord_upper': new Uniform2f(context, locations.u_pixel_coord_upper),
    'u_pixel_coord_lower': new Uniform2f(context, locations.u_pixel_coord_lower),
    'u_scale': new Uniform3f(context, locations.u_scale),
    'u_fade': new Uniform1f(context, locations.u_fade)
});

const fillOutlineUniforms = (context: Context, locations: UniformLocations): FillOutlineUniformsType => ({
    'u_matrix': new UniformMatrix4f(context, locations.u_matrix),
    'u_world': new Uniform2f(context, locations.u_world)
});

const fillOutlinePatternUniforms = (context: Context, locations: UniformLocations): FillOutlinePatternUniformsType => ({
    'u_matrix': new UniformMatrix4f(context, locations.u_matrix),
    'u_world': new Uniform2f(context, locations.u_world),
    'u_image': new Uniform1i(context, locations.u_image),
    'u_texsize': new Uniform2f(context, locations.u_texsize),
    'u_pixel_coord_upper': new Uniform2f(context, locations.u_pixel_coord_upper),
    'u_pixel_coord_lower': new Uniform2f(context, locations.u_pixel_coord_lower),
    'u_scale': new Uniform3f(context, locations.u_scale),
    'u_fade': new Uniform1f(context, locations.u_fade)
});

const fillUniformValues = (matrix: mat4): UniformValues<FillUniformsType> => ({
    'u_matrix': matrix
});

//CartoVista - Added Support for Blend Modes - Begin
const fillBlendUniformValues = (matrix: mat4): UniformValues<FillBlendUniformsType> => ({
    'u_matrix': matrix
});

const fillGradientUniforms = (context: Context, locations: UniformLocations): FillGradientUniformsType => ({
    'u_matrix': new UniformMatrix4f(context, locations.u_matrix),
    'u_bounds_min': new Uniform2f(context, locations.u_bounds_min),
    'u_bounds_max': new Uniform2f(context, locations.u_bounds_max),
    'u_color_start': new Uniform4f(context, locations.u_color_start),
    'u_color_end': new Uniform4f(context, locations.u_color_end),
    'u_opacity': new Uniform1f(context, locations.u_opacity)
});

const fillGradientUniformValues = (
    matrix: mat4,
    boundsMin: [number, number],
    boundsMax: [number, number],
    colorStart: [number, number, number, number],
    colorEnd: [number, number, number, number],
    opacity: number
): UniformValues<FillGradientUniformsType> => ({
    'u_matrix': matrix,
    'u_bounds_min': boundsMin,
    'u_bounds_max': boundsMax,
    'u_color_start': colorStart,
    'u_color_end': colorEnd,
    'u_opacity': opacity
});

//CartoVista - Added Support for Blend Modes - End

const fillPatternUniformValues = (
    matrix: mat4,
    painter: Painter,
    crossfade: CrossfadeParameters,
    tile: Tile
): UniformValues<FillPatternUniformsType> => extend(
    fillUniformValues(matrix),
    patternUniformValues(crossfade, painter, tile)
);

const fillOutlineUniformValues = (matrix: mat4, drawingBufferSize: [number, number]): UniformValues<FillOutlineUniformsType> => ({
    'u_matrix': matrix,
    'u_world': drawingBufferSize
});

const fillOutlinePatternUniformValues = (
    matrix: mat4,
    painter: Painter,
    crossfade: CrossfadeParameters,
    tile: Tile,
    drawingBufferSize: [number, number]
): UniformValues<FillOutlinePatternUniformsType> => extend(
    fillPatternUniformValues(matrix, painter, crossfade, tile),
    {
        'u_world': drawingBufferSize
    }
);

export {
    fillUniforms,
    fillPatternUniforms,
    fillOutlineUniforms,
    fillOutlinePatternUniforms,
    fillUniformValues,
    fillPatternUniformValues,
    fillOutlineUniformValues,
    fillOutlinePatternUniformValues,
    //CartoVista - Added Support for Blend Modes - Begin
    fillBlendUniforms,
    fillBlendUniformValues,
    fillGradientUniforms,
    fillGradientUniformValues
    //CartoVista - Added Support for Blend Modes - End
};
