#pragma mapbox: define highp vec4 color
#pragma mapbox: define lowp float opacity

uniform vec4 u_color_start;
uniform vec4 u_color_end;

in float v_gradient_t;

void main() {
    #pragma mapbox: initialize highp vec4 color
    #pragma mapbox: initialize lowp float opacity

     // Mix start and end color based on gradient value
    vec4 gradientColor = mix(u_color_start, u_color_end, clamp(v_gradient_t, 0.0, 1.0));

    fragColor = gradientColor*opacity;

#ifdef OVERDRAW_INSPECTOR
    fragColor = vec4(1.0);
#endif
}
