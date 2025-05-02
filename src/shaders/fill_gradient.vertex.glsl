#pragma mapbox: define highp vec4 color
#pragma mapbox: define lowp float opacity

in vec2 a_pos;

uniform mat4 u_matrix;
uniform vec2 u_bounds_min;
uniform vec2 u_bounds_max;

out float v_gradient_t;

void main() {
    #pragma mapbox: initialize highp vec4 color
    #pragma mapbox: initialize lowp float opacity

    // Normalize within feature bounds
    vec2 size = u_bounds_max - u_bounds_min;

    // Avoid division by zero
    if (size.y > 0.0) {
        v_gradient_t = (a_pos.y - u_bounds_min.y) / size.y;
    } else {
        v_gradient_t = 0.0;
    }

    gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
}
