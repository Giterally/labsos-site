export const nodeVertexShader = `
varying vec3 vColor;

uniform float time;
uniform vec2 resolution;

void main() {
  vColor = vec3(0.1, 0.4, 0.2); // Default green color
  
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  
  // Add gentle floating animation
  float floatOffset = sin(time * 0.5 + position.x * 0.01) * 0.5 + 
                     cos(time * 0.3 + position.y * 0.01) * 0.3;
  mvPosition.y += floatOffset;
  
  gl_Position = projectionMatrix * mvPosition;
  
  // Calculate point size with distance attenuation
  float distance = length(mvPosition.xyz);
  gl_PointSize = 20.0 * (300.0 / distance);
}
`

export const nodeFragmentShader = `
varying vec3 vColor;

uniform float time;
uniform vec2 resolution;

void main() {
  vec2 center = gl_PointCoord - vec2(0.5);
  float distance = length(center);
  
  // Create circular shape
  float shape = 1.0 - smoothstep(0.4, 0.5, distance);
  
  // Apply alpha with smooth edges
  float alpha = shape * 0.8;
  
  gl_FragColor = vec4(vColor, alpha);
}
`

export const particleVertexShader = `
varying vec3 vColor;

uniform float time;

void main() {
  vColor = vec3(0.2, 0.6, 0.3); // Green color for particles
  
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  
  // Add gentle floating motion
  float floatOffset = sin(time * 2.0 + position.x * 0.1) * 0.2;
  mvPosition.y += floatOffset;
  
  gl_Position = projectionMatrix * mvPosition;
  
  // Size based on distance
  float distance = length(mvPosition.xyz);
  gl_PointSize = 3.0 * (200.0 / distance);
}
`

export const particleFragmentShader = `
varying vec3 vColor;

uniform float time;

void main() {
  vec2 center = gl_PointCoord - vec2(0.5);
  float distance = length(center);
  
  // Create circular particle
  float shape = 1.0 - smoothstep(0.3, 0.5, distance);
  
  // Apply alpha
  float alpha = shape * 0.8;
  
  gl_FragColor = vec4(vColor, alpha);
}
`

export const connectionVertexShader = `
attribute float opacity;
attribute float pulsePhase;

varying float vOpacity;
varying float vPulsePhase;

uniform float time;

void main() {
  vOpacity = opacity;
  vPulsePhase = pulsePhase;
  
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  
  // Add gentle wave motion to connections
  float wave = sin(time * 0.5 + position.x * 0.01) * 0.5;
  mvPosition.y += wave;
  
  gl_Position = projectionMatrix * mvPosition;
}
`

export const connectionFragmentShader = `
varying float vOpacity;
varying float vPulsePhase;

uniform float time;
uniform vec3 color;

void main() {
  // Create dashed line effect
  float dashPattern = sin(vPulsePhase + time * 2.0) * 0.5 + 0.5;
  
  // Pulse the opacity
  float pulse = sin(time * 1.5 + vPulsePhase) * 0.2 + 0.8;
  
  float finalOpacity = vOpacity * dashPattern * pulse;
  
  gl_FragColor = vec4(color, finalOpacity);
}
`
