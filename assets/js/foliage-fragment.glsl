uniform sampler2D alphaMap;
uniform vec3 u_timeOfDayTint;
varying vec2 v_uvs;

void main() {
    vec4 texColor = texture2D(alphaMap, v_uvs);
    
    float alpha = texColor.r;
    if (alpha < 0.1) discard;

    // Add some color variation based on UVs
    float variation = mix(0.8, 1.2, sin(v_uvs.x * 10.0) * 0.5 + 0.5);
    
    // Base green with some yellow/brown variation
    vec3 darkGreen = vec3(0.2, 0.35, 0.1);
    vec3 lightGreen = vec3(0.627, 0.639, 0.965);
    
    // Mix based on position
    vec3 green = mix(darkGreen, lightGreen, v_uvs.y);
    green *= variation;
    
    gl_FragColor = vec4(green * u_timeOfDayTint, alpha);
}