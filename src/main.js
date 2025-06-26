import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { gsap } from 'gsap';

// Create a loading manager to track progress
const loadingManager = new THREE.LoadingManager();
const loadingElement = document.createElement('div');
loadingElement.style.position = 'fixed';
loadingElement.style.top = '50%';
loadingElement.style.left = '50%';
loadingElement.style.transform = 'translate(-50%, -50%)';
loadingElement.style.color = 'white';
loadingElement.style.fontSize = '24px';
loadingElement.style.fontFamily = 'Arial, sans-serif';
loadingElement.style.zIndex = '1000';
loadingElement.textContent = 'Loading...';
document.body.appendChild(loadingElement);

loadingManager.onProgress = (url, loaded, total) => {
  const progress = Math.round((loaded / total) * 100);
  loadingElement.textContent = `Loading... ${progress}%`;
};

loadingManager.onLoad = () => {
  document.body.removeChild(loadingElement);
  // Fade in the content
  gsap.to('.hero-content', { 
    opacity: 1, 
    duration: 1.5, 
    delay: 0.5 
  });
};

// Initialize scene
const scene = new THREE.Scene();

// Initialize camera
const camera = new THREE.OrthographicCamera(
  window.innerWidth / -2,
  window.innerWidth / 2,
  window.innerHeight / 2,
  window.innerHeight / -2,
  0.1,
  1000
);
camera.position.z = 1;

// Create renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.getElementById('hero-container').prepend(renderer.domElement);

// Detect device capability
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const isLowPerfDevice = isMobile && window.devicePixelRatio < 2;

// Create video texture
const video = document.createElement('video');
video.src = '/textures/flowers-moving.mp4'; // Updated path
video.loop = true;
video.muted = true;
video.playsInline = true;
video.autoplay = true;
video.addEventListener('loadeddata', () => {
  video.play();
});

video.addEventListener('canplay', () => {
  if (document.body.contains(loadingElement)) {
    document.body.removeChild(loadingElement);
    // Fade in the content
    gsap.to('.hero-content', { 
      opacity: 1, 
      duration: 1.5, 
      delay: 0.5 
    });
  }
});

const videoTexture = new THREE.VideoTexture(video);
videoTexture.minFilter = THREE.LinearFilter;
videoTexture.magFilter = THREE.LinearFilter;
videoTexture.format = THREE.RGBFormat;

// Create custom shader material for interactive distortion
const flowersShader = {
  uniforms: {
    tDiffuse: { value: videoTexture },
    time: { value: 0 },
    mousePosition: { value: new THREE.Vector2(0.5, 0.5) },
    mouseStrength: { value: 0 },
    resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    videoResolution: { value: new THREE.Vector2(1920, 1080) } // Update if your video is a different size
  },
  vertexShader: `
    varying vec2 vUv;
    
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform vec2 mousePosition;
    uniform float mouseStrength;
    uniform vec2 resolution;
    uniform vec2 videoResolution;
    varying vec2 vUv;
    
    // Simple noise function
    float noise(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }
    
    // Improved noise function
    vec2 hash22(vec2 p) {
      p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
      return fract(sin(p) * 43758.5453);
    }
    
    float perlinNoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f*f*(3.0-2.0*f); // Smoothstep
      
      vec2 a = hash22(i);
      vec2 b = hash22(i + vec2(1.0, 0.0));
      vec2 c = hash22(i + vec2(0.0, 1.0));
      vec2 d = hash22(i + vec2(1.0, 1.0));
      
      return mix(mix(dot(a, f - vec2(0.0, 0.0)), dot(b, f - vec2(1.0, 0.0)), f.x),
                mix(dot(c, f - vec2(0.0, 1.0)), dot(d, f - vec2(1.0, 1.0)), f.x),
                f.y) * 0.5 + 0.5;
    }
    
    void main() {
      // Calculate aspect-corrected UV coordinates
      vec2 uv = vUv;
      float videoAspect = videoResolution.x / videoResolution.y;
      float screenAspect = resolution.x / resolution.y;
      
      if (screenAspect > videoAspect) {
        // Screen is wider than video
        float scale = screenAspect / videoAspect;
        uv.x = (uv.x - 0.5) * scale + 0.5;
      } else {
        // Screen is taller than video
        float scale = videoAspect / screenAspect;
        uv.y = (uv.y - 0.5) * scale + 0.5;
      }
      
      // Create subtle autonomous movement
      float slowTime = time * 0.1;
      float distX = perlinNoise(vec2(uv.y * 3.0, slowTime)) * 0.002;
      float distY = perlinNoise(vec2(uv.x * 2.0, slowTime * 1.5)) * 0.002;
      
      // Add mouse interaction
      float dist = distance(uv, mousePosition);
      float mouseEffect = smoothstep(0.5, 0.0, dist) * mouseStrength * 0.02;
      vec2 dir = normalize(uv - mousePosition);
      
      // Detect flower areas (more effect on red/orange parts)
      vec4 originalColor = texture2D(tDiffuse, uv);
      float isFlower = smoothstep(0.3, 0.7, originalColor.r - originalColor.b);
      
      // Apply distortion with more effect on flower areas
      vec2 distortedUV = uv;
      distortedUV += dir * mouseEffect * (isFlower * 0.8 + 0.2);
      distortedUV.x += distX * (isFlower * 0.8 + 0.2);
      distortedUV.y += distY * (isFlower * 0.8 + 0.2);
      
      // Sample the texture with distorted UVs
      vec4 color = texture2D(tDiffuse, distortedUV);
      
      // Add subtle glow to flowers
      if (isFlower > 0.5) {
        float glow = sin(time * 0.5) * 0.05 + 1.0;
        color.rgb *= glow;
      }
      
      gl_FragColor = color;
    }
  `
};

// Create a plane for our shader
const geometry = new THREE.PlaneGeometry(window.innerWidth, window.innerHeight);
const material = new THREE.ShaderMaterial(flowersShader);
const plane = new THREE.Mesh(geometry, material);
scene.add(plane);

// Set up post-processing
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// Add bloom effect (skip on low-performance devices)
if (!isLowPerfDevice) {
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.8,  // strength
    0.3,  // radius
    0.66  // threshold
  );
  composer.addPass(bloomPass);
}

// Create floating particles
function createParticles() {
  const particleCount = isLowPerfDevice ? 30 : 70;
  const particleGeometry = new THREE.BufferGeometry();
  const particlePositions = new Float32Array(particleCount * 3);
  const particleSizes = new Float32Array(particleCount);
  
  for (let i = 0; i < particleCount; i++) {
    // Random positions across the screen
    particlePositions[i * 3] = (Math.random() - 0.5) * window.innerWidth;
    particlePositions[i * 3 + 1] = (Math.random() - 0.5) * window.innerHeight;
    particlePositions[i * 3 + 2] = 0.1;
    
    // Random sizes
    particleSizes[i] = Math.random() * 3 + 1;
  }
  
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  particleGeometry.setAttribute('size', new THREE.BufferAttribute(particleSizes, 1));
  
  // Create a canvas texture for particles
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  
  // Draw a soft circle
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.5, 'rgba(255, 200, 150, 0.5)');
  gradient.addColorStop(1, 'rgba(255, 180, 120, 0)');
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  
  const particleTexture = new THREE.CanvasTexture(canvas);
  
  const particleMaterial = new THREE.PointsMaterial({
    size: 10,
    map: particleTexture,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    color: 0xffaa77
  });
  
  const particles = new THREE.Points(particleGeometry, particleMaterial);
  scene.add(particles);
  
  return particles;
}

const particles = createParticles();

// Mouse interaction
let mousePosition = new THREE.Vector2(0.5, 0.5);
let mouseStrength = 0;
let isMouseMoving = false;
let mouseTimeout;

document.addEventListener('mousemove', (e) => {
  mousePosition.x = e.clientX / window.innerWidth;
  mousePosition.y = 1 - (e.clientY / window.innerHeight);
  
  // Increase strength on movement
  mouseStrength = 1;
  isMouseMoving = true;
  
  // Reset timeout
  clearTimeout(mouseTimeout);
  mouseTimeout = setTimeout(() => {
    isMouseMoving = false;
  }, 100);
});

// Touch support for mobile
document.addEventListener('touchmove', (e) => {
  if (e.touches.length > 0) {
    mousePosition.x = e.touches[0].clientX / window.innerWidth;
    mousePosition.y = 1 - (e.touches[0].clientY / window.innerHeight);
    mouseStrength = 1;
    isMouseMoving = true;
    
    clearTimeout(mouseTimeout);
    mouseTimeout = setTimeout(() => {
      isMouseMoving = false;
    }, 100);
  }
});

// Handle window resize
window.addEventListener('resize', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  
  // Update camera
  camera.left = width / -2;
  camera.right = width / 2;
  camera.top = height / 2;
  camera.bottom = height / -2;
  camera.updateProjectionMatrix();
  
  // Update renderer and composer
  renderer.setSize(width, height);
  composer.setSize(width, height);
  
  // Update shader uniforms
  material.uniforms.resolution.value.set(width, height);
  
  // Update plane size
  plane.geometry.dispose();
  plane.geometry = new THREE.PlaneGeometry(width, height);
});

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  
  const time = performance.now() * 0.001;
  
  // Update shader uniforms
  material.uniforms.time.value = time;
  material.uniforms.mousePosition.value = mousePosition;
  
  // Gradually decrease mouse strength when not moving
  if (!isMouseMoving && mouseStrength > 0) {
    mouseStrength *= 0.95;
  }
  
  material.uniforms.mouseStrength.value = mouseStrength;
  
  // Animate particles
  if (particles) {
    const positions = particles.geometry.attributes.position.array;
    const particleCount = positions.length / 3;
    
    for (let i = 0; i < particleCount; i++) {
      // Gentle floating motion
      positions[i * 3] += Math.sin(time * 0.5 + i * 0.3) * 0.2;
      positions[i * 3 + 1] += Math.cos(time * 0.3 + i * 0.5) * 0.1 - 0.1;
      
      // Reset particles that float out of view
      if (positions[i * 3 + 1] < -window.innerHeight / 2 - 10) {
        positions[i * 3 + 1] = window.innerHeight / 2 + 10;
        positions[i * 3] = (Math.random() - 0.5) * window.innerWidth;
      }
    }
    
    particles.geometry.attributes.position.needsUpdate = true;
  }
  
  // Render the scene
  composer.render();
}

animate();
