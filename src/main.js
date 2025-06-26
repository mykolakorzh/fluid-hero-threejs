import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { gsap } from 'gsap';

// Initialize scene
const canvas = document.getElementById('bg-canvas');
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
camera.position.z = 1;

// Renderer setup
const renderer = new THREE.WebGLRenderer({ 
  canvas: canvas,
  antialias: true,
  alpha: true 
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// Shader material for flower movement effect
const fragmentShader = `
  uniform float time;
  uniform vec2 resolution;
  uniform sampler2D imageTexture;
  uniform vec2 mouse;
  
  // Simplex noise function for organic movement
  vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
             -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
    + i.x + vec3(0.0, i1.x, 1.0 ));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
      dot(x12.zw,x12.zw)), 0.0);
    m = m*m ;
    m = m*m ;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }
  
  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    
    // Create gentle swaying motion like flowers in a breeze
    float swaySpeed = 0.3;
    float swayAmount = 0.005;
    
    // Different noise patterns for x and y distortion
    float noiseX = snoise(vec2(uv.x * 3.0, uv.y * 2.0 + time * swaySpeed)) * swayAmount;
    float noiseY = snoise(vec2(uv.x * 2.5, uv.y * 3.5 + time * swaySpeed * 0.8)) * swayAmount;
    
    // Add more intense movement for the orange/red flower areas
    vec4 originalColor = texture2D(imageTexture, uv);
    float isFlower = originalColor.r > 0.5 ? 1.0 : 0.3; // Detect orange/red areas
    
    // Mouse interaction creates a "breeze" effect
    float mouseEffect = 0.0;
    if (mouse.x > 0.0 && mouse.y > 0.0) {
      vec2 mousePos = mouse / resolution.xy;
      float dist = distance(uv, mousePos);
      float angle = atan(uv.y - mousePos.y, uv.x - mousePos.x);
      mouseEffect = smoothstep(0.5, 0.0, dist) * 0.015;
      noiseX += mouseEffect * cos(angle);
      noiseY += mouseEffect * sin(angle);
    }
    
    // Apply distortion with more effect on flower areas
    vec2 distortedUV = uv;
    distortedUV.x += noiseX * isFlower;
    distortedUV.y += noiseY * isFlower;
    
    // Sample the texture with distorted UVs
    vec4 color = texture2D(imageTexture, distortedUV);
    
    // Add subtle pulsing glow to flowers
    float pulseRate = 0.4;
    float pulseAmount = 0.1;
    float pulse = sin(time * pulseRate) * pulseAmount + 1.0;
    
    // Enhance red/orange parts (flowers)
    if (color.r > 0.5) {
      color.rgb += color.rgb * 0.1 * pulse;
    }
    
    // Add slight depth to blue areas (background)
    if (color.b > color.r) {
      color.rgb += vec3(0.0, 0.0, 0.05) * sin(time * 0.2);
    }
    
    gl_FragColor = color;
  }
`;

const vertexShader = `
  void main() {
    gl_Position = vec4(position, 1.0);
  }
`;

// Load the texture
const textureLoader = new THREE.TextureLoader();
const texture = textureLoader.load('public/textures/original-image.jpg');

// Create shader material
const shaderMaterial = new THREE.ShaderMaterial({
  uniforms: {
    time: { value: 0 },
    resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    imageTexture: { value: texture },
    mouse: { value: new THREE.Vector2(-1, -1) }
  },
  vertexShader: vertexShader,
  fragmentShader: fragmentShader,
});

// Create a plane that fills the screen
const geometry = new THREE.PlaneGeometry(2, 2);
const plane = new THREE.Mesh(geometry, shaderMaterial);
scene.add(plane);

// Post-processing
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// Add bloom effect for the glow - enhance the flower colors
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.7,  // strength - increased for flowers
  0.5,  // radius - slightly increased for softer glow
  0.7   // threshold - lowered to catch more of the flower colors
);
composer.addPass(bloomPass);

// Add floating particles for pollen/petals effect
function createFloatingParticles() {
  const particleCount = 50;
  const particleGeometry = new THREE.BufferGeometry();
  const particlePositions = new Float32Array(particleCount * 3);
  const particleSizes = new Float32Array(particleCount);
  
  for (let i = 0; i < particleCount; i++) {
    // Random positions across the screen
    particlePositions[i * 3] = (Math.random() - 0.5) * 2;
    particlePositions[i * 3 + 1] = (Math.random() - 0.5) * 2;
    particlePositions[i * 3 + 2] = 0.1; // Slightly in front of the main plane
    
    // Random sizes
    particleSizes[i] = Math.random() * 0.01 + 0.003;
  }
  
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  particleGeometry.setAttribute('size', new THREE.BufferAttribute(particleSizes, 1));
  
  const particleMaterial = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      color: { value: new THREE.Color(0xffaa77) }
    },
    vertexShader: `
      attribute float size;
      uniform float time;
      
      void main() {
        vec3 pos = position;
        
        // Gentle floating motion
        pos.x += sin(time * 0.5 + position.y * 5.0) * 0.02;
        pos.y += cos(time * 0.3 + position.x * 3.0) * 0.01 - time * 0.05;
        
        // Reset particles that float out of view
        if (pos.y < -1.2) {
          pos.y = 1.2;
          pos.x = (random(vec2(position.x, time)) - 0.5) * 2.0;
        }
        
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = size * (300.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      
      void main() {
        // Create circular particles
        float r = distance(gl_PointCoord, vec2(0.5, 0.5));
        if (r > 0.5) discard;
        
        // Soft edges
        float alpha = smoothstep(0.5, 0.4, r);
        gl_FragColor = vec4(color, alpha * 0.6);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  
  const particles = new THREE.Points(particleGeometry, particleMaterial);
  scene.add(particles);
  
  return particles;
}

const particles = createFloatingParticles();

// Mouse interaction
let mousePos = new THREE.Vector2(-1, -1);
window.addEventListener('mousemove', (event) => {
  mousePos.x = event.clientX;
  mousePos.y = window.innerHeight - event.clientY; // Invert Y for WebGL coords
  
  // Smooth transition using GSAP
  gsap.to(shaderMaterial.uniforms.mouse.value, {
    duration: 1,
    x: mousePos.x,
    y: mousePos.y,
    ease: "power2.out"
  });
});

// Handle window resize
window.addEventListener('resize', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  
  renderer.setSize(width, height);
  composer.setSize(width, height);
  shaderMaterial.uniforms.resolution.value.set(width, height);
});

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  
  // Update time uniform for the shader
  const timeValue = performance.now() * 0.001; // Convert to seconds
  shaderMaterial.uniforms.time.value = timeValue;
  
  // Update particle shader time
  particles.material.uniforms.time.value = timeValue;
  
  // Render scene with post-processing
  composer.render();
}

animate();
