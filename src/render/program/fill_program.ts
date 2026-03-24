import {patternUniformValues} from './pattern';
import {
    Uniform1i,
    Uniform1f,
    Uniform2f,
    Uniform3f,
    UniformColor,
} from '../uniform_binding';
import {extend} from '../../util/util';

import type {Painter} from '../painter';
import type {UniformValues, UniformLocations} from '../uniform_binding';
import type {Context} from '../../gl/context';
import type {CrossfadeParameters} from '../../style/evaluation_parameters';
import type {Tile} from '../../tile/tile';
import type {FillStyleLayer} from '../../style/style_layer/fill_style_layer';

export type FillUniformsType = {
    'u_fill_translate': Uniform2f;
};

export type FillGradientUniformsType = {
    'u_fill_translate': Uniform2f;
    'u_color_start':    UniformColor;
    'u_color_end':      UniformColor;
    'u_angle':          Uniform1f;
    'u_radial':         Uniform1f;
};

export type FillOutlineUniformsType = {
    'u_world': Uniform2f;
    'u_fill_translate': Uniform2f;
};

export type FillPatternUniformsType = {
    // pattern uniforms:
    'u_texsize': Uniform2f;
    'u_image': Uniform1i;
    'u_pixel_coord_upper': Uniform2f;
    'u_pixel_coord_lower': Uniform2f;
    'u_scale': Uniform3f;
    'u_fade': Uniform1f;
    'u_fill_translate': Uniform2f;
};

export type FillOutlinePatternUniformsType = {
    'u_world': Uniform2f;
    // pattern uniforms:
    'u_texsize': Uniform2f;
    'u_image': Uniform1i;
    'u_pixel_coord_upper': Uniform2f;
    'u_pixel_coord_lower': Uniform2f;
    'u_scale': Uniform3f;
    'u_fade': Uniform1f;
    'u_fill_translate': Uniform2f;
};

const fillUniforms = (context: Context, locations: UniformLocations): FillUniformsType => ({
    'u_fill_translate': new Uniform2f(context, locations.u_fill_translate)
});

const fillGradientUniforms = (context: Context, locations: UniformLocations): FillGradientUniformsType => ({
    'u_fill_translate': new Uniform2f(context, locations.u_fill_translate),
    'u_color_start':    new UniformColor(context, locations.u_color_start),
    'u_color_end':      new UniformColor(context, locations.u_color_end),
    'u_angle':          new Uniform1f(context, locations.u_angle),
    'u_radial':         new Uniform1f(context, locations.u_radial),
});

const fillPatternUniforms = (context: Context, locations: UniformLocations): FillPatternUniformsType => ({
    'u_image': new Uniform1i(context, locations.u_image),
    'u_texsize': new Uniform2f(context, locations.u_texsize),
    'u_pixel_coord_upper': new Uniform2f(context, locations.u_pixel_coord_upper),
    'u_pixel_coord_lower': new Uniform2f(context, locations.u_pixel_coord_lower),
    'u_scale': new Uniform3f(context, locations.u_scale),
    'u_fade': new Uniform1f(context, locations.u_fade),
    'u_fill_translate': new Uniform2f(context, locations.u_fill_translate)
});

const fillOutlineUniforms = (context: Context, locations: UniformLocations): FillOutlineUniformsType => ({
    'u_world': new Uniform2f(context, locations.u_world),
    'u_fill_translate': new Uniform2f(context, locations.u_fill_translate)
});

const fillOutlinePatternUniforms = (context: Context, locations: UniformLocations): FillOutlinePatternUniformsType => ({
    'u_world': new Uniform2f(context, locations.u_world),
    'u_image': new Uniform1i(context, locations.u_image),
    'u_texsize': new Uniform2f(context, locations.u_texsize),
    'u_pixel_coord_upper': new Uniform2f(context, locations.u_pixel_coord_upper),
    'u_pixel_coord_lower': new Uniform2f(context, locations.u_pixel_coord_lower),
    'u_scale': new Uniform3f(context, locations.u_scale),
    'u_fade': new Uniform1f(context, locations.u_fade),
    'u_fill_translate': new Uniform2f(context, locations.u_fill_translate)
});

const fillPatternUniformValues = (
    painter: Painter,
    crossfade: CrossfadeParameters,
    tile: Tile,
    translate: [number, number]
): UniformValues<FillPatternUniformsType> => extend(
    patternUniformValues(crossfade, painter, tile),
    {
        'u_fill_translate': translate,
    }
);

const fillUniformValues = (translate: [number, number]): UniformValues<FillUniformsType> => ({
    'u_fill_translate': translate,
});

const fillGradientUniformValues = (
    layer: FillStyleLayer,
    translate: [number, number]
): UniformValues<FillGradientUniformsType> => {
    const gradientType  = layer.paint.get('cv-fill-gradient-type');
    const startColor    = layer.paint.get('cv-fill-gradient-start-color');
    const endColor      = layer.paint.get('cv-fill-gradient-end-color');
    const angleDeg      = layer.paint.get('cv-fill-gradient-angle');
    const angleRad      = angleDeg * Math.PI / 180;
    const isRadial      = gradientType === 'radial';
    return {
        'u_fill_translate': translate,
        'u_color_start':    startColor,
        'u_color_end':      endColor,
        'u_angle':          angleRad,
        'u_radial':         isRadial ? 1.0 : 0.0,
    };
};

const fillOutlineUniformValues = (drawingBufferSize: [number, number], translate: [number, number]): UniformValues<FillOutlineUniformsType> => ({
    'u_world': drawingBufferSize,
    'u_fill_translate': translate,
});

const fillOutlinePatternUniformValues = (
    painter: Painter,
    crossfade: CrossfadeParameters,
    tile: Tile,
    drawingBufferSize: [number, number],
    translate: [number, number]
): UniformValues<FillOutlinePatternUniformsType> => extend(
    fillPatternUniformValues(painter, crossfade, tile, translate),
    {
        'u_world': drawingBufferSize
    }
);

export {
    fillUniforms,
    fillGradientUniforms,
    fillPatternUniforms,
    fillOutlineUniforms,
    fillOutlinePatternUniforms,
    fillUniformValues,
    fillGradientUniformValues,
    fillPatternUniformValues,
    fillOutlineUniformValues,
    fillOutlinePatternUniformValues
};
