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

  // Billboard effect - remap UVs to center
  vec2 vertexOffset = vec2(
    remap(uv.x, 0.0, 1.0, -1.0, 1.0),
    remap(uv.y, 0.0, 1.0, -1.0, 1.0)
  );
  
  vertexOffset = normalize(vertexOffset);

  // Simple wind effect - sway based on height
  float windStrength = uv.y; // More movement at top
  vec3 windOffset = vec3(
    sin(u_windTime + position.x * 0.5) * windStrength * u_windSpeed * 0.3,
    0.0,
    cos(u_windTime + position.z * 0.5) * windStrength * u_windSpeed * 0.2
  );

  vec4 worldViewPosition = modelViewMatrix * vec4(position + windOffset, 1.0);
  worldViewPosition += vec4(mix(vec3(0.0), vec3(vertexOffset, 1.0), u_effectBlend), 0.0);

    gl_Position = projectionMatrix * worldViewPosition;
}