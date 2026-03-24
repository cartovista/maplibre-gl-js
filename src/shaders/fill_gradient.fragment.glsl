uniform vec4  u_color_start;
uniform vec4  u_color_end;
uniform float u_angle;   // radians; 0=left→right, π/2=bottom→top
uniform float u_radial;  // 0.0=linear, 1.0=radial

in vec2 v_uv;

void main() {
    float t;
    if (u_radial > 0.5) {
        // Radial: distance from AABB centre, normalised so t=1 at any edge midpoint.
        t = clamp(length(v_uv - vec2(0.5)) * 2.0, 0.0, 1.0);
    } else {
        // Linear: project UV onto gradient direction vector, centred on 0.5.
        t = clamp(dot(v_uv - vec2(0.5), vec2(cos(u_angle), sin(u_angle))) + 0.5, 0.0, 1.0);
    }
    vec4 c = mix(u_color_start, u_color_end, t);
    // Premultiplied alpha output to match MapLibre's compositing convention.
    fragColor = vec4(c.rgb * c.a, c.a);

#ifdef OVERDRAW_INSPECTOR
    fragColor = vec4(1.0);
#endif
}
