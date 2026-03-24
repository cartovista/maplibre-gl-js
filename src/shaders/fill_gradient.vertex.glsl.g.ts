// This file is generated. Edit build/generate-shaders.ts, then run `npm run codegen`.
export default 'uniform vec2 u_fill_translate;in vec2 a_pos;in vec2 a_bounds_min;in vec2 a_bounds_max;out vec2 v_uv;void main(){v_uv=(a_pos-a_bounds_min)/max(a_bounds_max-a_bounds_min,vec2(0.001));gl_Position=projectTile(a_pos+u_fill_translate,a_pos);}';
