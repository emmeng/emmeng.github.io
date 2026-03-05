//Base fragment shader + methodology is from Michael Dougall!! Please check out his awesome tutorial regarding fluffy trees in three.js


uniform float u_effectBlend;
uniform float u_windSpeed;
uniform float u_windTime;

varying vec2 v_uvs;

float inverseLerp(float v, float minValue, float maxValue) {
    return (v - minValue) / (maxValue - minValue);
}

float remap(float v, float prevMin, float prevMax, float newMin, float newMax) {
    float t = inverseLerp(v, prevMin, prevMax);
    return mix(newMin, newMax, t);
}

void main() {
    v_uvs = uv;

    vec2 vertexOffset = vec2(
        remap(uv.x, 0.0, 1.0, -1.0, 1.0),
        remap(uv.y, 0.0, 1.0, -1.0, 1.0)
    );

    vertexOffset = normalize(vertexOffset);

    float swayFactor = uv.y;
    vec3 windOffset = vec3(
        sin(u_windTime + position.x * 0.5) * swayFactor * u_windSpeed * 0.3,
        0.0,
        cos(u_windTime + position.z * 0.5) * swayFactor * u_windSpeed * 0.2
    );

    vec4 mvPosition = modelViewMatrix * vec4(position + windOffset, 1.0);
    mvPosition.xyz += mix(vec3(0.0), vec3(vertexOffset, 0.0), u_effectBlend);
    gl_Position = projectionMatrix * mvPosition;
}