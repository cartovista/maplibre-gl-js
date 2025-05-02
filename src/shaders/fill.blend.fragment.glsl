#pragma mapbox: define highp vec4 color
#pragma mapbox: define lowp float opacity

void main() {
    #pragma mapbox: initialize highp vec4 color
    #pragma mapbox: initialize lowp float opacity

    fragColor = vec4(1.0, 0.0, 1.0, 1.0); // hardcoded pink

#ifdef OVERDRAW_INSPECTOR
    fragColor = vec4(1.0);
#endif
}