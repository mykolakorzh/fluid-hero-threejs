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

// Improved fragment shader that properly displays the texture and adds subtle animation
const fragmentShader = `
  uniform float time;
  uniform vec2 resolution;
  uniform sampler2D imageTexture;
  uniform vec2 mouse;
  
  // Simple noise function
  float noise(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }
  
  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    
    // Add subtle movement to the flowers
    float distortionAmount = 0.005;
    float slowTime = time * 0.2;
    
    // Create gentle wave distortion
    float distX = sin(uv.y * 10.0 + slowTime) * distortionAmount;
    float distY = cos(uv.x * 8.0 + slowTime * 0.7) * distortionAmount;
    
    // Add mouse interaction
    if (mouse.x > 0.0) {
      vec2 mousePos = mouse / resolution.xy;
      float dist = distance(uv, mousePos);
      if (dist < 0.3) {
        float strength = smoothstep(0.3, 0.0, dist) * 0.02;
        vec2 dir = normalize(uv - mousePos);
        distX += dir.x * strength;
        distY += dir.y * strength;
      }
    }
    
    // Apply distortion
    vec2 distortedUV = uv;
    distortedUV.x += distX;
    distortedUV.y += distY;
    
    // Sample the texture
    vec4 color = texture2D(imageTexture, distortedUV);
    
    // Add subtle pulsing to orange/red parts (flowers)
    if (color.r > 0.5 && color.r > color.b) {
      float pulse = sin(time * 0.5) * 0.05 + 1.0;
      color.rgb *= pulse;
    }
    
    gl_FragColor = color;
  }
`;

const vertexShader = `
  void main() {
    gl_Position = vec4(position, 1.0);
  }
`;

// Improved particle vertex shader that doesn't use the undefined random function
const particleVertexShader = `
  attribute float size;
  uniform float time;
  
  // Simple hash function for pseudo-randomness
  float hash(float n) {
    return fract(sin(n) * 43758.5453);
  }
  
  void main() {
    vec3 pos = position;
    
    // Use hash function instead of random
    float randomOffset = hash(position.x * 100.0 + position.y * 10.0);
    
    // Gentle floating motion
    pos.x += sin(time * 0.5 + position.y * 5.0) * 0.02;
    pos.y += cos(time * 0.3 + position.x * 3.0) * 0.01 - time * 0.05;
    
    // Reset particles that float out of view
    if (pos.y < -1.2) {
      pos.y = 1.2;
      pos.x = (hash(position.x + time) - 0.5) * 2.0;
    }
    
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = size * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// Load the texture and start animation only after it's loaded
const textureLoader = new THREE.TextureLoader();
let particles; // Declare particles variable outside the load callback

textureLoader.load(
  '/textures/flowers.jpeg',
  (texture) => {
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
      0.7,  // strength
      0.5,  // radius
      0.7   // threshold
    );
    composer.addPass(bloomPass);

    // Now create particles after texture is loaded
    particles = createFloatingParticles();

    // Mouse interaction
    let mousePos = new THREE.Vector2(-1, -1);
    window.addEventListener('mousemove', (event) => {
      mousePos.x = event.clientX;
      mousePos.y = window.innerHeight - event.clientY; // Invert Y for WebGL coords
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
      
      // Update particle time uniform
      if (particles && particles.material.uniforms) {
        particles.material.uniforms.time.value = timeValue;
      }
      
      // Render scene with post-processing
      composer.render();
    }
    
    animate();
  },
  undefined,
  (err) => {
    console.error('Texture loading error:', err);
  }
);

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
    vertexShader: particleVertexShader,
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

// Add a simple fallback if WebGL is not supported
if (!renderer) {
  const fallbackEl = document.createElement('div');
  fallbackEl.style.width = '100%';
  fallbackEl.style.height = '100vh';
  fallbackEl.style.background = 'url("/textures/flowers.jpeg") center center / cover no-repeat';
  document.getElementById('hero-container').appendChild(fallbackEl);
  console.warn('WebGL not supported, falling back to static image');
}
