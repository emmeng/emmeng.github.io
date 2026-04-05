import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';



let scene, camera, renderer, composer, controls;
let train = null;
const clock = new THREE.Clock();
const PIXEL_SIZE = 3;
const VIEW_SIZE = 8;
const _starParticles = [];
let currentDancer = null; // only one at a time
const BOOMBOX_DANCE_CHANCE = 0.9; // 40% chance — tweak between 0.0 and 1.0
// ---- Music Note Particles ----
const _musicNotes = [];
const MUSIC_NOTE_CHARS = ['♩', '♪', '♫', '♬'];
let _musicNoteInterval = null;


// Train animation variables
const trainStartX = -15;
const trainMiddleX = 0;
const trainEndX = 15;
const trainStartPos = new THREE.Vector3(-10, 0.2, -5);
const trainMiddlePos = new THREE.Vector3(0, 0.2, -7.5);
const trainEndPos = new THREE.Vector3(10, 0.2, -10);
let trainCycleStart = Date.now();
// Add at top with other globals
const BENCH_POS = new THREE.Vector3( -5,  0,  -4);  // Your bench position
const BOOMBOX_POS = new THREE.Vector3(-4, 0, -2.6);  // Your boombox position
const BOOMBOX_RADIUS = 2;  // Dance area size

// Store all loaded models/characters
const loadedCharacters = [];
const loadedProps = [];

// Fountain behavior constants =============
const FOUNTAIN_POS = new THREE.Vector3(0, 0, 1);
const FOUNTAIN_VIEW_RADIUS = 3.5; // Distance to trigger fountain viewing
const FOUNTAIN_VIEW_CHANCE = 0.3;
const FOUNTAIN_VIEW_TIME = 3000; // How long to watch fountain (ms)
const SUNFISH_FADE_DURATION = 1000; // How long fade in/out takes (ms)
const SUNFISH_VISIBLE_TIME = 3000; // How long sunfish stays visible (ms)

// Sunfish effect variables
let sunfishFadeState = null; // null, 'fadingIn', 'visible', 'fadingOut'
let sunfishFadeStartTime = 0;
let sunfishModel = null; // Store the loaded model

// Subway passenger system
let subwayPassenger = null;
let passengerState = 'waiting'; // 'waiting', 'wandering', 'boarding', 'gone'
let trainVisitCount = 0;

const WANDER_BOUNDS = [
    { x: -9, z: -3.5 },   // Top-left
    { x: 9, z: -8 },    // Top-right
    { x: 9, z: 9 },     // Bottom-right
    { x: -9, z: 9 }     // Bottom-left
];

// Cafe system constants
const CAFE_POS = new THREE.Vector3(10, 0, -5);
const CAFE_RADIUS = 5; // 3x3 area (radius 1.5)
const CAFE_PURCHASE_CHANCE = 0.8;
const EATING_DURATION = 3000; // How long eating animation lasts (ms)
const MIN_TIME_BEFORE_EATING = 10000; // Min 10 seconds
const MAX_TIME_BEFORE_EATING = 180000; // Max 3 minutes

// Array to store street light positions
const streetLights = [];

// List of food items available at cafe
const CAFE_FOOD_ITEMS = [
    'models/carpaccio.glb',
    'models/jasmine_tea.glb',
];

// Hover interaction variables
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hoveredCharacter = null;

// ID Card system
let characterData = null;
let cardVisible = false;

let currentAccentColor = '#78B8FF';
let currentHour = new Date().getHours();

// currentHour = 20;


let foliageVertexShader = null;
let foliageFragmentShader = null;

// Load both shader files
Promise.all([
    fetch('assets/js/foliage-vertex.glsl').then(response => response.text()),
    fetch('assets/js/foliage-fragment.glsl').then(response => response.text())
]).then(([vertex, fragment]) => {
    foliageVertexShader = vertex;
    foliageFragmentShader = fragment;
    console.log('✓ Both shaders loaded');
}).catch(error => {
    console.error('✗ Failed to load shaders:', error);
});

const loadingManager = new THREE.LoadingManager();

loadingManager.onStart = function (url, itemsLoaded, itemsTotal) {
    console.log('Started loading:', itemsTotal, 'items');
};

loadingManager.onProgress = function (url, itemsLoaded, itemsTotal) {
    const progress = (itemsLoaded / itemsTotal * 100).toFixed(0);

    document.getElementById('progress-fill').style.width = progress + '%';
    document.getElementById('progress-text').textContent = progress + '%';
};

loadingManager.onLoad = function () {
    console.log('✓ All assets loaded');

    setTimeout(() => {
        const loadingScreen = document.getElementById('loading-screen');
        loadingScreen.classList.add('fade-out');

        setTimeout(() => {
            loadingScreen.style.display = 'none';
        }, 500);
    }, 500);
};

loadingManager.onError = function (url) {
    console.error('Error loading:', url);
};

const isMobile = window.matchMedia("(max-width: 768px)").matches;
if (!isMobile) {
    init();
    animate();
}



// Returns 0-1 based on how strong street lighting should be
function getStreetLightIntensity() {
    const currentHour = new Date().getHours();

    if (currentHour >= 7 && currentHour < 17) {
        return 0.0;  // Day: lights off
    } else if (currentHour >= 17 && currentHour < 19) {
        // Sunset: fade in (5pm = 0.0, 7pm = 1.0)
        return (0.5+(currentHour - 17)) / 2;
    } else if (currentHour >= 5 && currentHour < 7) {
        // Sunrise: fade out (5am = 1.0, 7am = 0.0)
        return 1.0 - ((currentHour - 5) / 2);
    } else {
        return 1.0;  // Night: full intensity
    }
}

// Update character lighting (only during evening/night)
function updateCharacterLighting(char) {
    const streetLightIntensity = getStreetLightIntensity();

    // Skip calculation if lights are off (daytime)
    if (streetLightIntensity === 0.0) {
        // Just apply time tint without street light calculation
        char.model.traverse((child) => {
            if (child.isMesh && child.userData.baseColor) {
                const TIME_TINT = getTimeTint();
                child.material.color
                    .copy(child.userData.baseColor)
                    .multiply(TIME_TINT);
            }
        });
        return;
    }

    // Calculate street light influence
    let additionalLight = 0;
    const charPos = char.model.position;

    streetLights.forEach(light => {
        const dist = charPos.distanceTo(light.position);
        if (dist < light.radius) {
            const falloff = 1.0 - (dist / light.radius);
            additionalLight = Math.max(additionalLight, falloff * light.intensity);
        }
    });

    // Apply lighting with time-based intensity
    char.model.traverse((child) => {
        if (child.isMesh && child.userData.baseColor) {
            const TIME_TINT = getTimeTint();
           const brightnessMult = 1.0 + (additionalLight * streetLightIntensity * 5.0);

            child.material.color
                .copy(child.userData.baseColor)
                .multiply(TIME_TINT)
                .multiplyScalar(brightnessMult);
        }
    });
}

// Update glow visibility based on time
function updateStreetLightGlows() {
    const intensity = getStreetLightIntensity();

    scene.traverse((child) => {
        if (child.userData.isStreetLightGlow) {
            child.material.opacity = 0.6 * intensity;  // Fade in/out with time
        }
    });
}

// Modified addStreetLightGlow to mark glows
function addStreetLightGlow(x, z, radius, lampHeight) {

    const sphereCanvas = document.createElement('canvas');
    sphereCanvas.width = 128;
    sphereCanvas.height = 128;
    const sphereCtx = sphereCanvas.getContext('2d');

    const sphereGradient = sphereCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
    sphereGradient.addColorStop(0, 'rgba(255, 240, 200, 0.5)');    // Bright core
    sphereGradient.addColorStop(0.3, 'rgba(255, 220, 150, 0.4)');
    sphereGradient.addColorStop(0.6, 'rgba(255, 200, 100, 0.2)');
    sphereGradient.addColorStop(1, 'rgba(255, 200, 100, 0)');

    sphereCtx.fillStyle = sphereGradient;
    sphereCtx.fillRect(0, 0, 128, 128);

    const sphereTexture = new THREE.CanvasTexture(sphereCanvas);

    // Create sphere of light at lamp top
const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
        map: sphereTexture,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    })
);
    sprite.position.set(x, lampHeight, z);
    sprite.scale.setScalar(radius * 1.5);
    sprite.renderOrder = 10;
    sprite.userData.isStreetLightGlow = true;
    scene.add(sprite);

    // Store light data
    streetLights.push({
        position: new THREE.Vector3(x, lampHeight, z),
        radius,
        intensity: 0.6
    });


  
}
function addStreetLight(x, y, z, radius = 2, lampHeight = 4) {
    // Load the physical lamp post model
    loadProp({
        path: 'models/street_light.glb',
        position: { x, y, z },
        scale: 1,
        hasShadow: false,
        rendererOrder: 5 // Ensure lamp renders above characters but below glows
    });

    // Add the glow effect on the ground
    addStreetLightGlow(x, z, radius, lampHeight);
}

/* ------------------ INIT ------------------ */

function init() {
    const container = document.getElementById('plaza-container');

    scene = new THREE.Scene();
//     const fogColor = (currentHour >= 7 && currentHour < 17) 
//     ? 0xadd8e6  // Day: light blue
//     : 0x2a2a4a; // Night: dark blue

// scene.fog = new THREE.Fog(fogColor, 10, 30);
// scene.background = new THREE.Color(fogColor);

    // === TIME-OF-DAY GRADIENT SKY ===
    function getGradientSkyColors() {
        if (currentHour >= 7 && currentHour < 17) {
            return ["#C3DFFF", "#EEF6FF"];
        } else if ((currentHour >= 17 && currentHour < 19) || (currentHour >= 5 && currentHour < 6)) {
            return ["#EB9AB6", "#FFB46A"];
        } else {
            return ["#1C145B", "#25476D"];
        }
    }

    const [topColor, bottomColor] = getGradientSkyColors();
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, topColor);
    grad.addColorStop(1, bottomColor);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1, 256);
    scene.background = new THREE.CanvasTexture(canvas);


    // setTimeOfDay();

    // === CAMERA & RENDERER ===
    const aspect = window.innerWidth / window.innerHeight;

    camera = new THREE.OrthographicCamera(
        -VIEW_SIZE * aspect / 2,  // left
        VIEW_SIZE * aspect / 2,   // right
        VIEW_SIZE / 2,            // top
        -VIEW_SIZE / 2,           // bottom
        -10,                      // near
        1000                     // far
    );
    // const angle = (0.2 / 12) * Math.PI * 2; // 5 o'clock position = 150° from top
    // const elevation = -30 * (Math.PI / 180); // 30 degrees elevation
    // const distance = 15; // Distance from fountain

    // // Calculate position
    // const x = Math.sin(angle) * Math.cos(elevation) * distance;
    // const y = Math.sin(elevation) * distance;
    // const z = Math.cos(angle) * Math.cos(elevation) * distance;

    camera.position.set(0, 10, 10);
    camera.lookAt(0, 0, 0); // Look at fountain at origin

    renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.domElement.style.pointerEvents = 'none';
    renderer.setPixelRatio(1);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);

    // Setup OrbitControls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minZoom = 0.5;
    controls.maxZoom = 3;
    controls.target.set(0, 0, 0);

    composer = new EffectComposer(renderer);
    composer.setPixelRatio(1);
    composer.setSize(window.innerWidth, window.innerHeight);

    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // Custom pixelation shader
    const pixelShader = {
        uniforms: {
            tDiffuse: { value: null },
            resolution: { value: new THREE.Vector4(window.innerWidth, window.innerHeight, PIXEL_SIZE, PIXEL_SIZE) }
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
            uniform vec4 resolution;
            varying vec2 vUv;
            void main() {
                vec2 pixelSize = resolution.zw;
                vec2 dxy = pixelSize / resolution.xy;
                vec2 coord = dxy * floor(vUv / dxy);
                gl_FragColor = texture2D(tDiffuse, coord);
            }
        `
    };

    const pixelPass = new ShaderPass(pixelShader);
    composer.addPass(pixelPass);

    const copyPass = new ShaderPass(CopyShader);
    copyPass.renderToScreen = true;
    composer.addPass(copyPass);

    // === ROTATING CLOUD SPHERE ===
    const cloudTexture = new THREE.TextureLoader().load(
        "images/cloud_testing.png",
        (texture) => {
            console.log('✓ Cloud texture loaded');
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        },
        undefined,
        (error) => {
            console.error('✗ Cloud texture failed to load:', error);
        }
    );
    const cloudSphere = new THREE.Mesh(
        new THREE.SphereGeometry(20, 32, 32),
        new THREE.MeshBasicMaterial({
            map: cloudTexture,
            side: THREE.BackSide,
            transparent: true,
            opacity: 0.4,
            depthWrite: false
        })
    );
    cloudSphere.renderOrder = -1;
    scene.add(cloudSphere);

    // === PLAZA GROUND ===
    const floorTexture = new THREE.TextureLoader().load(
        "models/textures/plaza_tiles.png",
        (texture) => {
            console.log('✓ Floor texture loaded');
        },
        undefined,
        (error) => {
            console.error('✗ Floor texture failed to load:', error);
        }
    );
    floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(6, 6);
    floorTexture.colorSpace = THREE.LinearSRGBColorSpace;

    let TIME_TINT = getTimeTint();

    const floorMaterial = new THREE.MeshBasicMaterial({
        map: floorTexture,
        color: TIME_TINT,
        side: THREE.DoubleSide
    });

    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(20, 20),
        floorMaterial
    );

    floor.position.y = -0.1;
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    createShadows();

    // === LOAD YOUR SCENE OBJECTS ===

    // Fountain at center
    loadFountain({
        position: { x: FOUNTAIN_POS.x, y: FOUNTAIN_POS.y, z: FOUNTAIN_POS.z },
        scale: 1.5
    });

    // Shushu with wandering behavior
    loadCharacter({
        path: 'models/shushu.glb',
        position: { x: -6, y: 0, z: -3 },
        scale: 0.5,
        hasAnimation: true,
        hasShadow: true,
        shadowSize: 1.5,
        behavior: 'wander',
        wanderSpeed: 0.02,
    });
    loadCharacter({
        path: 'models/drzero.glb',
        position: { x: 3, y: 0, z: 3 },
        scale: 0.6,
        hasAnimation: true,
        hasShadow: true,
        shadowSize: 1.5,
        behavior: 'wander',
        wanderSpeed: 0.02,
    });


    loadCharacter({
        path: 'models/ghost.glb',
        position: { x: 3, y: 0, z: 3 },
        scale: 0.6,
        hasAnimation: true,
        hasShadow: true,
        shadowSize: 1.5,
        behavior: 'wander',
        wanderSpeed: 0.02,
    });

    loadCharacter({
        path: 'models/vivi.glb',
        position: { x: BENCH_POS.x - 0.5, y: 0, z: BENCH_POS.z },  // Left side of bench
        scale: 0.6,
        hasAnimation: true,
        behavior: 'sitting',  // NEW behavior type
        onLoad: (model, charData) => {
            // Play sitting animation immediately
            charData.playAnimation('sitting');  // or 'sitting' - check your animation name
        }
    });

    loadCharacter({
        path: 'models/vivi.glb',
        position: { x: BENCH_POS.x + 0.5, y: 0, z: BENCH_POS.z },  // Right side of bench
        scale: 0.6,
        hasAnimation: true,
        behavior: 'sitting',
        onLoad: (model, charData) => {
            charData.playAnimation('sitting');
        }
    });


    // loadProp({
    //     path: 'models/building_center.glb',
    //     position: { x: 3, y: 0, z: 0 },
    //     scale: 0.6,
    //     hasShadow: false
    // });

    loadProp({
        path: 'models/boombox.glb',
        position: { x: BOOMBOX_POS.x+0.5, y: 0, z: BOOMBOX_POS.z-1 },
        rotation: { x: 0, y: -0.25, z: 0 }, 
        scale: 0.5,
        hasShadow: false
    });

    loadProp({
        path: 'models/hydrangea_bush.glb',
        position: { x: -7.5, y: 0, z: -1.5 },
        rotation: { x: 0, y: Math.PI / 2, z: 0 }, 
        scale: 0.5,
        hasShadow: false
    });

    loadProp({
        path: 'models/bench.glb',
        position: { x: BENCH_POS.x, y: BENCH_POS.y, z: BENCH_POS.z },
        scale: 0.6,
        hasShadow: false
    });


    loadProp({
        path: 'models/vending_machine.glb',
        position: { x: -7, y: 0, z: -3 },
        rotation: { x: 0, y: Math.PI / 4, z: 0 }, 
        scale: 0.45,
        hasShadow: false
    });

    loadTrain();
    loadFluffyTree(6, 0, -6); // Position near fountain

    window.addEventListener('resize', onResize);
    onResize();
    addStreetLight(3, 0, -5);   // Top left area
    addStreetLight(5, 0, 5);   // Bottom right area
    addStreetLight(-8, 0, 0);   // Bottom right area

    renderer.domElement.style.pointerEvents = 'auto'; // ✅
}

/* ------------------ SHADOWS ------------------ */

function createShadows() {
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 128;
    shadowCanvas.height = 128;
    const ctx = shadowCanvas.getContext('2d');

    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(108, 136, 192, 0.4)');
    gradient.addColorStop(0.5, 'rgba(0, 50, 150, 0.2)');
    gradient.addColorStop(1, 'rgba(0, 50, 150, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);

    const shadowTexture = new THREE.CanvasTexture(shadowCanvas);

    const shadowMaterial = new THREE.MeshBasicMaterial({
        map: shadowTexture,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        color: 0x545454
    });

    window.shadowMaterial = shadowMaterial;
}

/* ------------------ HOVER INTERACTION SYSTEM ------------------ */

// Mouse move handler
function onPointerMove(event) {
    // Convert mouse position to normalized device coordinates (-1 to +1)
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

// ---- Star Particle System ----


const CONFETTI_COLORS = [
    0xB9EEFA, // blue
    0xDCECCE, // light green
    0xFFB8CB, // pink
    0xFFF7C9, // yellow
    0xD1D2F5, // purple
];

function _spawnStarBurst(worldPosition) {
    // console.log('🎊 confetti burst at', worldPosition);

    const count = 30;

    for (let i = 0; i < count; i++) {
        // Random confetti piece: thin rectangle
        const w = (0.03 + Math.random() * 0.08);
        const h = (0.01 + Math.random() * 0.06);
        const geometry = new THREE.PlaneGeometry(w, h);

        const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
        const material = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 1.0,
            side: THREE.DoubleSide,
            depthWrite: false,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = 10;
        mesh.position.copy(worldPosition);

        // Random initial rotation
        mesh.rotation.set(
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2
        );

        scene.add(mesh);

        // Burst velocity — outward + upward
        const theta = Math.random() * Math.PI * 2;
        const speed = 0.004 + Math.random() * 0.008;
        const velX = Math.cos(theta) * speed;
        const velY = 0.008 + Math.random() * 0.01; // upward pop
        const velZ = Math.sin(theta) * speed;

        // Tumble rotation speed
        const rotX = (Math.random() - 0.5) * 0.15;
        const rotY = (Math.random() - 0.5) * 0.15;
        const rotZ = (Math.random() - 0.5) * 0.15;

        _starParticles.push({
            mesh,
            material,
            vel: new THREE.Vector3(velX, velY, velZ),
            rotVel: new THREE.Vector3(rotX, rotY, rotZ),
            life: 1.0,
            decay: 0.018 + Math.random() * 0.01,
        });
    }
}

function updateStarParticles() {
    for (let i = _starParticles.length - 1; i >= 0; i--) {
        const p = _starParticles[i];
        p.life -= p.decay;

        // Gravity
        p.vel.y -= 0.0008;

        // Move
        p.mesh.position.add(p.vel);

        // Tumble
        p.mesh.rotation.x += p.rotVel.x;
        p.mesh.rotation.y += p.rotVel.y;
        p.mesh.rotation.z += p.rotVel.z;

        // Fade out
        p.material.opacity = Math.max(0, p.life);

        if (p.life <= 0) {
            scene.remove(p.mesh);
            p.mesh.geometry.dispose();
            p.material.dispose();
            _starParticles.splice(i, 1);
        }
    }
}
// Update hover detection in animate loop
function updateHoverInteraction() {
    raycaster.setFromCamera(pointer, camera);

    let newHoveredChar = null;

    for (const char of loadedCharacters) {
        const intersects = raycaster.intersectObject(char.model, true);
        if (intersects.length > 0) {
            newHoveredChar = char;
            break;
        }
    }

    // Hover ENTER - but NOT during fountain viewing or eating
    if (newHoveredChar && newHoveredChar !== hoveredCharacter) {
        if (newHoveredChar.state !== 'fountainViewing' && newHoveredChar.state !== 'eating' && newHoveredChar.state !== 'dancing') {
            newHoveredChar.isHovered = true;
            newHoveredChar.rotationMode = 'hover';
            if (!newHoveredChar.savedVelocity) {
                newHoveredChar.savedVelocity = newHoveredChar.velocity.clone();
            }
            newHoveredChar.velocity.set(0, 0, 0);
            document.body.style.cursor = 'pointer';

            // 🌟 Spawn star burst at character position (slightly above feet)
            const burstPos = newHoveredChar.model.position.clone();
            burstPos.y += 1.5; // adjust to character's torso height
            _spawnStarBurst(burstPos);
        }
    }

    // Hover EXIT → enter pause state
    if (!newHoveredChar && hoveredCharacter) {
        hoveredCharacter.isHovered = false;
        if (hoveredCharacter.state !== 'fountainViewing' && hoveredCharacter.state !== 'eating' && hoveredCharacter.state !== 'dancing') {
            hoveredCharacter.state = 'postHoverPause';
            hoveredCharacter.pauseStartTime = performance.now();
            hoveredCharacter.rotationMode = 'locked';
        }
        document.body.style.cursor = 'default';
    }

    hoveredCharacter = newHoveredChar;
}
function applyRotation(char) {
    const model = char.model;
    if (char.config.behavior === 'sitting') return;  // ADD THIS
    // Locked = do nothing (post-hover pause)
    if (char.rotationMode === 'locked') return;

    let targetY = null;
    let lerpFactor = 0.15; // Default for movement

    if (char.rotationMode === 'movement') {
        if (char.moveDir && char.moveDir.lengthSq() > 0.0001) {
            targetY = Math.atan2(char.moveDir.x, char.moveDir.z);
        }
    }
    else if (char.rotationMode === 'hover') {
        const modelWorldPos = new THREE.Vector3();
        char.model.getWorldPosition(modelWorldPos);

        const cameraWorldPos = new THREE.Vector3();
        camera.getWorldPosition(cameraWorldPos);

        const cameraGroundPos = new THREE.Vector3(cameraWorldPos.x, 0, cameraWorldPos.z);
        const dir = new THREE.Vector3().subVectors(cameraGroundPos, modelWorldPos);

        targetY = Math.atan2(dir.x, dir.z);

        // INSTANT SNAP - no lerp
        char.model.rotation.y = targetY;
        return; // Skip the lerp section below
    }
    else if (char.rotationMode === 'fountain') {
        const dir = new THREE.Vector3().subVectors(
            FOUNTAIN_POS,
            model.position
        );
        targetY = Math.atan2(dir.x, dir.z);
    } else if (char.state === 'eating') {
        // Rotation handled in updateEatingBehavior
        return;
    }

    if (targetY !== null) {
        const currentY = model.rotation.y;

        // --- shortest angle difference ---
        let delta = targetY - currentY;
        delta = ((delta + Math.PI) % (Math.PI * 2)) - Math.PI;

        // Smooth turn with variable lerp factor
        model.rotation.y = currentY + delta * lerpFactor;
    }
}

// Add event listener
window.addEventListener('pointermove', onPointerMove);

/* ------------------ MODULAR CHARACTER LOADER ------------------ */


function getTimeTint() {
    let tint;

    if (currentHour >= 7 && currentHour < 17) { // DAY
        tint = new THREE.Color(1.00, 1.00, 1.0);
    } else if ((currentHour >= 17 && currentHour < 19) || (currentHour >= 5 && currentHour < 6)) { // EVENING / SUNSET
        tint = new THREE.Color(0.95, 0.85, 0.80);
    } else { // NIGHT
        tint = new THREE.Color(0.75, 0.8, 0.9);
    }
    return tint;
}

// Separate function to update tint (can be called on time change)
function updateMaterialTint(child) {
    if (!child.material) return;

    const TIME_TINT = getTimeTint();
    const VERTEX_INTENSITY = getVertexLightIntensity();

    if (child.userData.hasVertexColors) {
        const adjustedColor = child.userData.baseColor.clone()
            .lerp(new THREE.Color(1, 1, 1), VERTEX_INTENSITY)
            .multiply(TIME_TINT);

        child.material.color.copy(adjustedColor);
    } else {
        child.material.color
            .copy(child.userData.baseColor)
            .multiply(TIME_TINT);
    }

    child.material.needsUpdate = true;
}

// Returns 0-1 based on how strong vertex lighting should be
function getVertexLightIntensity() {
    const currentHour = new Date().getHours();

    if (currentHour >= 7 && currentHour < 17) {
        return 0.0;  // Day: vertex lights invisible
    } else if (currentHour >= 17 && currentHour < 19) {
        return 0.5;  // Sunset: half intensity
    } else if (currentHour >= 5 && currentHour < 7) {
        return 0.7;  // Sunrise: mostly visible
    } else {
        return 0.0;  // Night: full intensity
    }
}

// In your animate function, add this:
function loadCharacter(config) {
    const defaults = {
        path: 'models/character.glb',
        position: { x: 0, y: 0, z: 0 },
        scale: 1,
        rotation: { x: 0, y: 0, z: 0 },
        hasAnimation: false,
        hasShadow: false,
        shadowSize: 1.5,
        behavior: null,
        wanderSpeed: 0.02,

        forwardOffset: 0, // Rotation offset in radians (e.g., -Math.PI/2 if model faces left)
        onLoad: null
        
    };

    const settings = { ...defaults, ...config };
    const loader = new GLTFLoader(loadingManager);

    loader.load(settings.path, (gltf) => {
        const character = gltf.scene;

        // Apply pixel-perfect materials
        character.traverse((child) => {
            if (child.isMesh) {
                const oldMaterial = child.material;
                const originalTexture = oldMaterial.map;

                if (originalTexture) {
                    originalTexture.minFilter = THREE.NearestFilter;
                    originalTexture.magFilter = THREE.NearestFilter;
                    originalTexture.generateMipmaps = false;
                    originalTexture.colorSpace = THREE.LinearSRGBColorSpace;
                    originalTexture.needsUpdate = true;
                }

                let materialColor = new THREE.Color(0xffffff);
                if (oldMaterial.color) {
                    materialColor = oldMaterial.color.clone();
                    if (materialColor.r < 0.1 && materialColor.g < 0.1 && materialColor.b < 0.1) {
                        materialColor = new THREE.Color(0xffffff);
                    }
                }

                let isTransparent = oldMaterial.transparent || false;
                let alphaTest = 0.0;

                if (oldMaterial.alphaTest > 0) {
                    alphaTest = oldMaterial.alphaTest;
                    isTransparent = true;
                }

                const matName = oldMaterial.name ? oldMaterial.name.toLowerCase() : '';
                if (matName.includes('transparent') || matName.includes('alpha') || matName.includes('cutout')) {
                    isTransparent = true;
                    alphaTest = 0.5;
                }
                const isInner = child.name.toLowerCase().includes('inner');
                child.material = new THREE.MeshBasicMaterial({
                    map: originalTexture,
                    color: materialColor,
                    vertexColors: true,
                    side: THREE.DoubleSide,
                    transparent: true,  // ALWAYS true (like index.js)
                    opacity: oldMaterial.opacity !== undefined ? oldMaterial.opacity : 1.0,
                    // NO alphaTest
                });

                if (isInner) {
                    child.renderOrder = 1;
                } else {
                    child.renderOrder = 2;
                }
                child.userData.baseColor = materialColor.clone();
                // Apply time-based tint
                updateMaterialTint(child);


  
            }
        });

        // Set transform
        character.position.set(settings.position.x, settings.position.y, settings.position.z);
        character.scale.setScalar(settings.scale);
        character.rotation.set(settings.rotation.x, settings.rotation.y, settings.rotation.z);

        // Add shadow
        if (settings.hasShadow && window.shadowMaterial) {
            const shadowPlane = new THREE.Mesh(
                new THREE.PlaneGeometry(settings.shadowSize, settings.shadowSize),
                window.shadowMaterial.clone()
            );
            shadowPlane.rotation.x = -Math.PI / 2;
            shadowPlane.position.y = 0.01;
            character.add(shadowPlane);
        }

        // Handle animations - store ALL animations by name
        let mixer = null;
        let animations = {};
        let currentAction = null;

        if (settings.hasAnimation && gltf.animations.length) {
            mixer = new THREE.AnimationMixer(character);
            console.log(`\n📦 ${settings.path}`); // ADD THIS

            // Store all animations by name
            gltf.animations.forEach(clip => {
                animations[clip.name] = mixer.clipAction(clip);
                console.log(`  ✓ Animation: ${clip.name}`);
            });

            // Play first animation by default
            if (gltf.animations.length > 0) {
                // Try to find walk animation first, otherwise use first animation
                const walkAnim = gltf.animations.find(anim => anim.name.toLowerCase().includes('walk'));
                const firstAnim = walkAnim || gltf.animations[0];
                currentAction = animations[firstAnim.name];
                currentAction.play();
            }
        } else {
            console.log("NO ANIMATIONS")
        }

        scene.add(character);

        // Setup behavior state
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * settings.wanderSpeed * 2, // Multiply by 2 to ensure meaningful movement
            0,
            (Math.random() - 0.5) * settings.wanderSpeed * 2
        );

        // Store character data with animation system
        const charData = {
            model: character,
            mixer: mixer,
            animations: animations,
            currentAction: currentAction,
            config: settings,
            velocity: velocity,
            state: 'walking',
            stateTimer: 0,
            fountainViewStartTime: 0,

            // Hover state tracking
            isHovered: false,
            originalRotationY: character.rotation.y,

            // Cafe system
            hasVisitedCafe: false,
            holdingFood: null,
            eatTime: null,
            eatingStartTime: 0,

            // Helper function to switch animations smoothly
            playAnimation: function (animName, fadeTime = 0.2) {
                const resolvedName = Object.keys(this.animations).find(name =>
                    name.toLowerCase().includes(animName.toLowerCase())
                );

                if (resolvedName) {
                    const newAction = this.animations[resolvedName];

                    if (this.currentAction !== newAction) {
                        if (this.currentAction) {
                            this.currentAction.fadeOut(fadeTime);
                        }
                        newAction.reset().fadeIn(fadeTime).play();
                        this.currentAction = newAction;
                        console.log(`Switched to: ${resolvedName}`);
                    }
                    return newAction; // ✅ return it
                } else {
                    console.warn(`Animation "${animName}" not found in ${this.config.path}`);
                    return null;
                }
            }
        };

        loadedCharacters.push(charData);

        if (settings.onLoad) settings.onLoad(character, charData);
        console.log(`✓ Character loaded: ${settings.path}`);

    }, undefined, (error) => {
        console.error(`✗ Error loading character:`, error);
    });
}

/* ------------------ CHARACTER BEHAVIORS ------------------ */
function updateCharacterBehaviors() {
    loadedCharacters.forEach((char) => {
        if (char.config.behavior === 'sitting') return;
        if (!char.config.behavior || char.config.behavior === 'idle') return;

        // Skip subway passenger when they're boarding
        if (char === subwayPassenger && passengerState === 'boarding') return;

        checkIfShouldEat(char);
        checkBoomboxDance(char);

        if (char.state === 'eating') {
            updateEatingBehavior(char);
        } else if (char.state === 'dancing') {
            updateDancingBehavior(char);
        } else if (char.state === 'walkingToBoombox') {
            updateWalkToBoomboxBehavior(char); // ⬅️ moved INSIDE forEach
        } else if (char.config.behavior === 'wander') {
            updateWanderBehavior(char);
        }
    });

    // Handle subway passenger boarding separately (this one is correctly outside)
    if (subwayPassenger && passengerState === 'boarding') {
        updatePassengerBoarding();
    }
}
function updateWanderBehavior(char) {
    const model = char.model;
    const speed = char.config.wanderSpeed;

    // =========================
    // HOVER FREEZE (NO DIR CHANGE)
    // =========================
    if (char.isHovered) {
        char.velocity.set(0, 0, 0);
        return;
    }

    // =========================
    // POST-HOVER PAUSE
    // =========================
    if (char.state === 'postHoverPause') {
        char.velocity.set(0, 0, 0);

        if (performance.now() - char.pauseStartTime > 200) {
            char.state = 'walking';

            if (char.savedVelocity && char.savedVelocity.lengthSq() > 0) {
                char.velocity
                    .copy(char.savedVelocity)
                    .normalize()
                    .multiplyScalar(speed);

                char.moveDir = char.velocity.clone().normalize();
            }

            char.savedVelocity = null;
        }
        return;
    }

    // =========================
    // STATE: WALKING
    // =========================
    if (char.state === 'walking') {

        // Ensure direction
        if (char.velocity.lengthSq() === 0) {
            const dir = new THREE.Vector3(
                Math.random() - 0.5,
                0,
                Math.random() - 0.5
            ).normalize();

            char.velocity.copy(dir).multiplyScalar(speed);
            char.moveDir = dir.clone();
        }

        char.velocity.normalize().multiplyScalar(speed);
        char.moveDir = char.velocity.clone().normalize();

        const nextPos = model.position.clone().add(char.velocity);

        // =========================
        // POLYGON BOUNDS CHECK
        // =========================
        const nextPoint = {
            x: nextPos.x,
            z: nextPos.z
        };

        if (!isPointInPolygon(nextPoint, WANDER_BOUNDS)) {
            // Find direction back toward center of bounds
            const center = WANDER_BOUNDS.reduce(
                (acc, p) => ({ x: acc.x + p.x / WANDER_BOUNDS.length, z: acc.z + p.z / WANDER_BOUNDS.length }),
                { x: 0, z: 0 }
            );

            const toCenter = new THREE.Vector3(
                center.x - model.position.x,
                0,
                center.z - model.position.z
            ).normalize();

            // Add a little random angle so they don't all beeline to center
            const angle = (Math.random() - 0.5) * Math.PI * 0.5;
            toCenter.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);

            char.velocity.copy(toCenter).multiplyScalar(speed);
            char.moveDir = toCenter.clone();

            // If already outside, nudge back in immediately
            if (!isPointInPolygon({ x: model.position.x, z: model.position.z }, WANDER_BOUNDS)) {
                model.position.add(toCenter.clone().multiplyScalar(0.2));
            }

            return;
        }
        const distToFountain = nextPos.distanceTo(FOUNTAIN_POS);

        // =========================
        // FOUNTAIN COLLISION + VIEW
        // =========================
        if (distToFountain < FOUNTAIN_VIEW_RADIUS) {

            char.velocity.set(0, 0, 0);

            const wasNear = char.wasNearFountain || false;

            if (!wasNear && Math.random() < FOUNTAIN_VIEW_CHANCE) {
                char.state = 'fountainViewing';
                char.rotationMode = 'fountain';
                char.fountainViewStartTime = Date.now();
                char.wasNearFountain = true;

                char.playAnimation('wish');
                triggerSunfishAppearance();
                return;
            }

            const away = new THREE.Vector3()
                .subVectors(model.position, FOUNTAIN_POS)
                .normalize();

            model.position.add(away.multiplyScalar(0.08));

            char.velocity.copy(away).multiplyScalar(speed);
            char.moveDir = away.clone();

            return;
        }

        char.wasNearFountain = false;

        if (!char.hasVisitedCafe) {
            const distToCafe = model.position.distanceTo(CAFE_POS);

            if (distToCafe < CAFE_RADIUS && Math.random() < CAFE_PURCHASE_CHANCE) {
                visitCafe(char);
                return;
            }
        }

        // =========================
        // PROP COLLISION
        // =========================
        const propCollision = checkPropCollision(nextPos);

        if (propCollision) {
            const away = new THREE.Vector3()
                .subVectors(model.position, propCollision)
                .normalize();

            char.velocity.copy(away).multiplyScalar(speed);
            char.moveDir = away.clone();
            return;
        }

        // =========================
        // MOVE
        // =========================
        model.position.add(char.velocity);

        char.rotationMode = 'movement';
    }

    // =========================
    // STATE: FOUNTAIN VIEWING
    // =========================
    else if (char.state === 'fountainViewing') {

        char.rotationMode = 'fountain';

        if (Date.now() - char.fountainViewStartTime > FOUNTAIN_VIEW_TIME) {

            char.state = 'walking';
            char.wasNearFountain = false;

            const dir = new THREE.Vector3(
                Math.random() - 0.5,
                0,
                Math.random() - 0.5
            ).normalize();

            char.velocity.copy(dir).multiplyScalar(speed);
            char.moveDir = dir.clone();

            char.playAnimation('walk');
        }
    }
}

function isPointInPolygon(point, polygon) {

    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {

        const xi = polygon[i].x;
        const zi = polygon[i].z;

        const xj = polygon[j].x;
        const zj = polygon[j].z;

        const intersect =
            ((zi > point.z) !== (zj > point.z)) &&
            (point.x < (xj - xi) * (point.z - zi) / (zj - zi) + xi);

        if (intersect) inside = !inside;
    }

    return inside;
}

/* ------------------ COLLISION DETECTION ------------------ */

function checkPropCollision(position, currentPos, checkRadius = 0.5) {
    // Check collision with other props
    for (const prop of loadedProps) {
        const distToProp = position.distanceTo(prop.model.position);
        if (distToProp < checkRadius + 0.5) {
            // Return the prop's position so we can bounce away from it
            return prop.model.position.clone();
        }
    }

    return null; // No collision
}

// Old function kept for compatibility if needed elsewhere
function isCollidingWithProps(position, checkRadius = 0.5) {
    return checkPropCollision(position, null, checkRadius) !== null;
}

/* ------------------ SUNFISH FADE EFFECT ------------------ */

function loadSunfishOnDemand() {
    if (sunfishModel) return; // Already loaded

    const loader = new GLTFLoader();
    loader.load('models/sunfish.glb', (gltf) => {
        sunfishModel = gltf.scene;
        sunfishModel.position.set(0, 4, 0);
        sunfishModel.scale.setScalar(0.5);

        // Apply materials
        sunfishModel.traverse((child) => {
            child.renderOrder = 11; 
            if (child.isMesh) {
                const oldMaterial = child.material;
                const originalTexture = oldMaterial.map;

                if (originalTexture) {
                    originalTexture.minFilter = THREE.NearestFilter;
                    originalTexture.magFilter = THREE.NearestFilter;
                    originalTexture.generateMipmaps = false;
                    originalTexture.colorSpace = THREE.LinearSRGBColorSpace;
                    originalTexture.needsUpdate = true;
                }

                child.material = new THREE.MeshBasicMaterial({
                    map: originalTexture,
                    color: oldMaterial.color || new THREE.Color(0xffffff),
                    transparent: true,
                    depthWrite: false,      // ⬅️ don't block things behind transparent areas
                    alphaTest: 0.1, 
                });

            }
        });

        // Setup animation if exists
        if (gltf.animations.length > 0) {
            const mixer = new THREE.AnimationMixer(sunfishModel);
            mixer.clipAction(gltf.animations[0]).play();
            sunfishModel.userData.mixer = mixer;
        }

        console.log('Sunfish model loaded');
    });
}

function triggerSunfishAppearance() {
    if (sunfishFadeState !== null) return; // Already animating

    // Load model if not already loaded
    if (!sunfishModel) {
        loadSunfishOnDemand();
        // Wait for next trigger after model loads
        return;
    }

    // Add to scene
    scene.add(sunfishModel);

    sunfishFadeState = 'fadingIn';
    sunfishFadeStartTime = Date.now();
    console.log('Sunfish appearing!');
}

function updateSunfishFade(dt) {
    if (!sunfishModel || !sunfishFadeState) return;

    // Update animation
    if (sunfishModel.userData.mixer) {
        sunfishModel.userData.mixer.update(dt);
    }

    const elapsed = Date.now() - sunfishFadeStartTime;

    if (sunfishFadeState === 'fadingIn') {
        const fadeProgress = Math.min(elapsed / SUNFISH_FADE_DURATION, 1);
        setSunfishOpacity(fadeProgress);

        if (fadeProgress >= 1) {
            sunfishFadeState = 'visible';
            sunfishFadeStartTime = Date.now();
            console.log('Sunfish fully visible');
        }
    }
    else if (sunfishFadeState === 'visible') {
        if (elapsed > SUNFISH_VISIBLE_TIME) {
            sunfishFadeState = 'fadingOut';
            sunfishFadeStartTime = Date.now();
            console.log('Sunfish fading out');
        }
    }
    else if (sunfishFadeState === 'fadingOut') {
        const fadeProgress = Math.min(elapsed / SUNFISH_FADE_DURATION, 1);
        setSunfishOpacity(1 - fadeProgress);

        if (fadeProgress >= 1) {
            // Remove from scene
            scene.remove(sunfishModel);
            sunfishFadeState = null;
            console.log('Sunfish removed from scene');
        }
    }
}

function setSunfishOpacity(opacity) {
    if (!sunfishModel) return;

    sunfishModel.traverse((child) => {
        if (child.isMesh && child.material) {
            child.material.opacity = opacity;
        }
    });
}


// const _debugSpheres = new Map(); // label → mesh

// function showDebugRadius(label, position, radius, color = 0x00ff00) {
//     // Remove existing if already shown
//     if (_debugSpheres.has(label)) {
//         scene.remove(_debugSpheres.get(label));
//     }

//     const geo = new THREE.SphereGeometry(radius, 16, 16);
//     const mat = new THREE.MeshBasicMaterial({
//         color,
//         wireframe: true,
//         transparent: true,
//         opacity: 0.3,
//         depthWrite: false,
//     });
//     const mesh = new THREE.Mesh(geo, mat);
//     mesh.position.copy(position);
//     scene.add(mesh);
//     _debugSpheres.set(label, mesh);
// }
// showDebugRadius('boombox', BOOMBOX_POS, BOOMBOX_RADIUS, 0x00ff00);
// showDebugRadius('fountain', FOUNTAIN_POS, FOUNTAIN_VIEW_RADIUS, 0x0099ff);

const NOTE_COLORS = [
    '#d2ff93ff', // pink
    '#ff7fa1ff', // yellow
    '#ffc549ff', // mint
    '#ff4646ff',
    '#76e1ffff' ,
    '#83a8ffff' // sky blue
];



function startMusicNotes() {
    if (_musicNoteInterval) return; // already running
    _musicNoteInterval = setInterval(() => {
        _spawnMusicNote();
    }, 1000); // spawn a note every 400ms
}

function stopMusicNotes() {
    clearInterval(_musicNoteInterval);
    _musicNoteInterval = null;
}

function _spawnMusicNote() {
    // Create a canvas texture with a music note character
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = '40px Arial';
    ctx.fillStyle = NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)]; // ⬅️ random color
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
        MUSIC_NOTE_CHARS[Math.floor(Math.random() * MUSIC_NOTE_CHARS.length)],
        32, 32
    );

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 1.0,
        depthWrite: false,
        depthTest: false,
    });

    const sprite = new THREE.Sprite(material);

    // Spawn just above the boombox
    sprite.position.set(
        BOOMBOX_POS.x + (Math.random() - 0.5) * 1,
        BOOMBOX_POS.y + 0.3,
        BOOMBOX_POS.z + (Math.random() - 0.5) * 0.3
    );

    const scale = 0.3 + Math.random() * 0.2;
    sprite.scale.set(scale, scale, 1);
    sprite.renderOrder = 10;
    scene.add(sprite);

    _musicNotes.push({
        sprite,
        material,
        life: 1.0,
        decay: 0.008,
        velY: 0.004 + Math.random() * 0.002,   // float upward
        velX: (Math.random() - 0.5) * 0.003,   // slight horizontal drift
        wobble: Math.random() * Math.PI * 2,    // wobble offset
    });
}

function updateMusicNotes() {
    for (let i = _musicNotes.length - 1; i >= 0; i--) {
        const n = _musicNotes[i];
        n.life -= n.decay;
        n.wobble += 0.05;

        n.sprite.position.y += n.velY;
        n.sprite.position.x += n.velX + Math.sin(n.wobble) * 0.002; // gentle side wobble

        // Fade out in the last 30% of life
        n.material.opacity = n.life < 0.3 ? n.life / 0.3 : 1.0;

        if (n.life <= 0) {
            scene.remove(n.sprite);
            n.sprite.geometry?.dispose();
            n.material.map?.dispose();
            n.material.dispose();
            _musicNotes.splice(i, 1);
        }
    }
}
// ---- End Music Note Particles ----
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopMusicNotes();
    } else {
        // Clear any backed-up notes first
        _musicNotes.forEach(n => {
            scene.remove(n.sprite);
            n.material.map?.dispose();
            n.material.dispose();
        });
        _musicNotes.length = 0;

        startMusicNotes(); // restart clean
    }
});

startMusicNotes(); // restart clean

function checkBoomboxDance(char) {
    if (
        char.state === 'dancing' ||
        char.state === 'walkingToBoombox' ||
        char.state === 'eating' ||
        char.state === 'fountainViewing' ||
        char.hasDancedRecently ||
        currentDancer !== null
    ) return;

    const distToBoombox = char.model.position.distanceTo(BOOMBOX_POS);
    if (distToBoombox < BOOMBOX_RADIUS) {
        if (Math.random() < BOOMBOX_DANCE_CHANCE) { // ⬅️ roll the dice
            startWalkToBoombox(char);
        } else {
            // Failed the roll — apply cooldown so they don't re-roll every frame
            char.hasDancedRecently = true;
            setTimeout(() => { char.hasDancedRecently = false; }, 8000);
        }
    }
}

function startWalkToBoombox(char) {
    char.state = 'walkingToBoombox';
    char.rotationMode = 'movement';
    currentDancer = char;

    const dir = new THREE.Vector3()
        .subVectors(
            new THREE.Vector3(BOOMBOX_POS.x + 0.5, BOOMBOX_POS.y, BOOMBOX_POS.z-1),
            char.model.position
        )
        .setY(0)
        .normalize();

    char.moveDir = dir.clone();
    char.velocity.copy(dir).multiplyScalar(char.config.wanderSpeed);
    char.playAnimation('walk');

    // ⬅️ failsafe — force start dancing after 5 seconds regardless
    char._boomboxTimeout = setTimeout(() => {
        if (char.state === 'walkingToBoombox') {
            console.warn('⚠️ boombox walk timeout, forcing dance');
            startDancing(char);
        }
    }, 5000);
}

function updateWalkToBoomboxBehavior(char) {
    const target = new THREE.Vector3(BOOMBOX_POS.x, BOOMBOX_POS.y, BOOMBOX_POS.z);
    const dist = char.model.position.distanceTo(target);

    if (dist < 0.1) {
        startDancing(char);
        return;
    }

    const dir = new THREE.Vector3()
        .subVectors(target, char.model.position)
        .setY(0)
        .normalize();

    char.moveDir = dir.clone();
    char.velocity.copy(dir).multiplyScalar(char.config.wanderSpeed);

    char.model.position.add(char.velocity); // ⬅️ actually move the character
}
    function updateDancingBehavior(char) {
        // Fallback time-based stop if mixer events aren't working
        if (char.danceDuration) {
            const elapsed = Date.now() - char.danceStartTime;
            if (elapsed > char.danceDuration) {
                char.danceDuration = null;
                stopDancing(char);
            }
        }
    }

    function startDancing(char) {
        char.state = 'dancing';
        char.isDancing = true;
        char.danceStartTime = Date.now();
        char.dancePlayCount = 0;
        char.velocity.set(0, 0, 0);
        char.rotationMode = 'locked';
        char.model.rotation.set(0, 0, 0);

        const animations = char.mixer?._actions?.map(a => a.getClip().name) || [];
        const danceAnim = animations.find(name => name.toLowerCase().includes('dance')) || 'dance';
        char.danceAnimName = danceAnim;

        // Play dance and count completions
        const action = char.playAnimation(danceAnim);
        if (action) {
            action.setLoop(THREE.LoopRepeat, 2); // play exactly twice
            action.clampWhenFinished = true;

            // Listen for when animation finishes
            char.mixer.addEventListener('finished', function onDanceFinished(e) {
                if (e.action === action) {
                    char.mixer.removeEventListener('finished', onDanceFinished);
                    stopDancing(char);
                }
            });
        } else {
            // Fallback: time-based if action not returned
            char.danceDuration = 10000;
        }

        // Make bench sitters clap
        loadedCharacters.forEach(benchChar => {
            if (benchChar.config.behavior === 'sitting') {
                benchChar.playAnimation('clapping');
            }
        });

        console.log(`💃 ${char.config.name} dancing to: ${danceAnim}`);
    }

    function stopDancing(char) {
        char.state = 'walking';
        char.isDancing = false;
        char.rotationMode = 'movement';
        char.hasDancedRecently = true;
        currentDancer = null; // free the slot

        const newDir = new THREE.Vector3(
            Math.random() - 0.5, 0, Math.random() - 0.5
        ).normalize();
        char.moveDir = newDir.clone();
        char.velocity.copy(newDir).multiplyScalar(char.config.wanderSpeed);
        char.playAnimation('walk');

        // Stop bench sitters clapping
        loadedCharacters.forEach(benchChar => {
            if (benchChar.config.behavior === 'sitting') {
                benchChar.playAnimation('sitting');
            }
        });

        // Cooldown before this char can dance again
        setTimeout(() => {
            char.hasDancedRecently = false;
        }, 15000);
    }
/* ------------------ MODULAR PROP LOADER ------------------ */


function loadProp(config) {
    const defaults = {
        path: 'models/prop.glb',
        position: { x: 0, y: 0, z: 0 },
        scale: 1,
        rotation: { x: 0, y: 0, z: 0 },
        hasShadow: false,
        shadowSize: 1,
        parent: null,
        onLoad: null,
        renderOrder: 0,
    };

    const settings = { ...defaults, ...config };
    const loader = new GLTFLoader();

    loader.load(settings.path, (gltf) => {
        const prop = gltf.scene;

        prop.traverse((child) => {
            if (child.isMesh) {
                const oldMaterial = child.material;
                const originalTexture = oldMaterial.map;

                if (originalTexture) {
                    originalTexture.minFilter = THREE.NearestFilter;
                    originalTexture.magFilter = THREE.NearestFilter;
                    originalTexture.generateMipmaps = false;
                    originalTexture.colorSpace = THREE.LinearSRGBColorSpace;
                    originalTexture.flipY = false;
                    originalTexture.needsUpdate = true;
                }

                let materialColor = new THREE.Color(0xffffff);
                if (oldMaterial.color) {
                    materialColor = oldMaterial.color.clone();
                    if (materialColor.r < 0.1 && materialColor.g < 0.1 && materialColor.b < 0.1) {
                        materialColor = new THREE.Color(0xffffff);
                    }
                }

                // child.material = new THREE.MeshBasicMaterial({
                //     map: originalTexture,
                //     color: materialColor,
                //     side: THREE.DoubleSide,
                //     transparent: true,
                //     opacity: oldMaterial.opacity !== undefined ? oldMaterial.opacity : 1.0,
                // });
                // child.userData.baseColor = materialColor.clone();

                // const TIME_TINT = getTimeTint();
                // child.material.color
                //     .copy(child.userData.baseColor)
                //     .multiply(TIME_TINT);

                // child.material.needsUpdate = true;
                // child.renderOrder = settings.renderOrder;

                const hasVertexColors = !!child.geometry.attributes.color;

                child.material = new THREE.MeshBasicMaterial({
                    map: originalTexture,
                    color: materialColor,
                    vertexColors: hasVertexColors,
                    side: THREE.DoubleSide,
                    transparent: true,
                    opacity: oldMaterial.opacity !== undefined ? oldMaterial.opacity : 1.0,
                });
                child.userData.baseColor = materialColor.clone();
                child.userData.hasVertexColors = hasVertexColors;

                updateMaterialTint(child);
                child.material.needsUpdate = true;
                child.renderOrder = settings.renderOrder;

            }
        });

        prop.position.set(settings.position.x, settings.position.y, settings.position.z);
        prop.scale.setScalar(settings.scale);
        prop.rotation.set(settings.rotation.x, settings.rotation.y, settings.rotation.z);

        if (settings.hasShadow && window.shadowMaterial) {
            const shadowPlane = new THREE.Mesh(
                new THREE.PlaneGeometry(settings.shadowSize, settings.shadowSize),
                window.shadowMaterial.clone()
            );
            shadowPlane.rotation.x = -Math.PI / 2;
            shadowPlane.position.y = 0.01;
            prop.add(shadowPlane);
        }

        if (settings.parent) {
            settings.parent.add(prop);
        } else {
            scene.add(prop);
        }

        loadedProps.push({
            model: prop,
            config: settings
        });

        if (settings.onLoad) settings.onLoad(prop);
        console.log(`✓ Prop loaded: ${settings.path}`);

    }, undefined, (error) => {
        console.error(`✗ Error loading prop:`, error);
    });
}

/* ------------------ FOUNTAIN ------------------ */

function loadFountain(config) {
    const defaults = {
        path: 'models/fountain.glb',
        position: { x: 0, y: 0.1, z: 0 },
        scale: 1
    };

    const settings = { ...defaults, ...config };
    const loader = new GLTFLoader();

    const waterRadialTexture = new THREE.TextureLoader().load("models/textures/water_t1.png");
    waterRadialTexture.wrapS = waterRadialTexture.wrapT = THREE.RepeatWrapping;
    waterRadialTexture.center.set(0.5, 0.5);
    waterRadialTexture.colorSpace = THREE.LinearSRGBColorSpace;

    const waterFallingTexture = new THREE.TextureLoader().load("models/textures/water_t4.png");
    waterFallingTexture.wrapS = waterFallingTexture.wrapT = THREE.RepeatWrapping;
    waterFallingTexture.colorSpace = THREE.LinearSRGBColorSpace;

    const waterRadialMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uSpeed: { value: 0.1 },
            uTexture: { value: waterRadialTexture },
            uCenter: { value: new THREE.Vector2(0.5, 0.5) }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform float uTime;
            uniform float uSpeed;
            uniform sampler2D uTexture;
            uniform vec2 uCenter;
            varying vec2 vUv;

            void main() {
                vec2 uv = vUv - uCenter;
                float r = length(uv);
                float angle = atan(uv.y, uv.x);
                float animatedR = fract(r - uTime * uSpeed);
                vec2 polarUv = vec2(animatedR, angle / (2.0 * 3.141592) + 0.5);
                vec4 texColor = texture2D(uTexture, polarUv);
                float edgeFade = smoothstep(0.95, 0.7, r);
                gl_FragColor = vec4(texColor.rgb, texColor.a * edgeFade);
            }
        `,
        transparent: true,
        depthWrite: false
    });

    loader.load(settings.path, (gltf) => {
        const fountain = gltf.scene;

        fountain.traverse((child) => {
            if (child.isMesh && child.material) {
                const matName = child.material.name.toLowerCase();

                if (matName.includes("radial") || matName.includes("basin")) {
                    child.material = waterRadialMaterial;
                    child.userData.isWaterRadial = true;
                    child.userData.waterMaterial = waterRadialMaterial;
                } else if (matName.includes("down") || matName.includes("fall")) {
                    child.position.y += 0.001;
                    child.material = new THREE.MeshBasicMaterial({
                        map: waterFallingTexture,
                        transparent: true,
                        opacity: 0.8,
                    });
                    child.userData.isWaterFalling = true;
                    child.userData.fallingTexture = waterFallingTexture;
                } else if (matName.includes("lower") || matName.includes("pool")) {
                    child.position.y += 0.01;
                    child.material = new THREE.MeshBasicMaterial({
                        color: 0x3399ff,
                        transparent: true,
                        opacity: 0.5
                    });
                } else {
                    const oldMat = child.material;
                    const texture = oldMat.map;

                    if (texture) {
                        texture.minFilter = THREE.NearestFilter;
                        texture.magFilter = THREE.NearestFilter;
                        texture.generateMipmaps = false;
                        texture.colorSpace = THREE.LinearSRGBColorSpace;
                        texture.needsUpdate = true;
                    }

                    child.material = new THREE.MeshBasicMaterial({
                        map: texture,
                        color: oldMat.color || new THREE.Color(0xffffff)
                    });
                }
            }
        });

        fountain.position.set(settings.position.x, settings.position.y, settings.position.z);
        fountain.scale.setScalar(settings.scale);
        scene.add(fountain);

        loadedProps.push({
            model: fountain,
            config: settings
        });

        console.log('✓ Fountain loaded with water shaders');
    });
}

function loadFluffyTree(x, y, z) {
    const loader = new GLTFLoader(loadingManager);

    loader.load('models/tree.glb', (gltf) => {
        const tree = gltf.scene;
        tree.position.set(x, y, z);
        tree.scale.setScalar(0.5);

        // Load alpha map for foliage transparency
        const textureLoader = new THREE.TextureLoader(loadingManager);
        textureLoader.load('images/tree_alpha.png', (alphaMap) => {
            console.log('Alpha map loaded for fluffy tree');
            alphaMap.flipY = false;
            alphaMap.colorSpace = THREE.NoColorSpace;
            alphaMap.needsUpdate = true;
            // Shader material
            const customMaterial = new THREE.ShaderMaterial({
                vertexShader: foliageVertexShader,   // from loaded file
                fragmentShader: foliageFragmentShader, // from loaded file
                uniforms: {
                    u_effectBlend: { value: 2.0 },
                    u_windSpeed: { value: 0.5 },
                    u_windTime: { value: 0.0 },
                    alphaMap: { value: alphaMap },
                    u_timeOfDayTint: { value: getTimeTint() }
                },
                transparent: true,
                side: THREE.DoubleSide
            });

            // Apply shader to foliage meshes
            tree.traverse((child) => {
                if (child.isMesh) {
                    console.log('Mesh found:', child.name);
                    if (child.name.toLowerCase().includes('foliage')) {
                        console.log('✓ Foliage mesh found:', child.name);
                        child.material = customMaterial;
                        child.userData.foliageMaterial = customMaterial;
                        child.frustumCulled = false;
                    }
                }
            });

            scene.add(tree);

            loadedProps.push({
                model: tree,
                config: {
                    type: 'fluffyTree',
                    scale: 0.8,
                }
            });

            console.log(`✓ Fluffy tree loaded at (${x}, ${y}, ${z})`);
        });
    });
}

/* ------------------ TRAIN ------------------ */
function loadTrain() {
    const loader = new GLTFLoader();

    const trainTexture = new THREE.TextureLoader().load("models/textures/train_256.png");
    trainTexture.flipY = false;

    const trainMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uMap: { value: trainTexture },
            uTimeTint: { value: getTimeTint() },
            uFadeStart: { value: -8.0 },
            uFadeEnd: { value: 8.0 },
            uFadeDistance: { value: 2.0 },
        },
        vertexShader: `
            #include <skinning_pars_vertex>
            varying vec3 vPos;
            varying vec2 vUv;
            void main() {
                vec3 transformed = vec3(position);
                #include <skinbase_vertex>
                #include <skinning_vertex>
                vPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D uMap;
            uniform vec3 uTimeTint;
            uniform float uFadeStart;
            uniform float uFadeEnd;
            uniform float uFadeDistance;
            varying vec3 vPos;
            varying vec2 vUv;
            void main() {
                vec4 baseColor = texture2D(uMap, vUv);
                vec3 tintedColor = baseColor.rgb * uTimeTint;
                float fadeIn = smoothstep(uFadeStart - uFadeDistance, uFadeStart, vPos.x);
                float fadeOut = 1.0 - smoothstep(uFadeEnd, uFadeEnd + uFadeDistance, vPos.x);
                float alpha = fadeIn * fadeOut;
                if (alpha < 0.01) discard;
                gl_FragColor = vec4(tintedColor, alpha);
            }
        `,
        transparent: true,
        depthWrite: false,
        depthTest: true,
    });

    loader.load("models/train.glb", (gltf) => {
        console.log('🚂 train loaded, animations:', gltf.animations.length);

        // Find armature
        let armature = null;
        gltf.scene.traverse(child => {
            if (child.name === 'TrainArmature') armature = child;
        });
        console.log('armature:', armature?.name);

        train = gltf.scene;

        train.traverse((child) => {
            if (child.isMesh || child.isSkinnedMesh) {
                child.material = trainMaterial;
            }
        });

        train.scale.set(0.8, 0.8, 0.8);
        train.position.copy(trainStartPos);

        const direction = new THREE.Vector3().subVectors(trainEndPos, trainStartPos);
        const baseAngle = Math.atan2(direction.x, direction.z);
        train.rotation.y = baseAngle - Math.PI / 2;

        train.visible = false;
        train.renderOrder = 8;

        // Setup animations
        if (gltf.animations.length > 0) {
            window.trainMixer = new THREE.AnimationMixer(armature || train);
            window.trainAnimations = {};

            gltf.animations.forEach(clip => {
                window.trainAnimations[clip.name] = window.trainMixer.clipAction(clip);
                console.log('✅ registered animation:', clip.name);
            });

            console.log('trainMixer ready:', !!window.trainMixer);
            console.log('trainAnimations:', Object.keys(window.trainAnimations));
        } else {
            console.warn('❌ no animations in GLB');
        }

        scene.add(train);
        console.log('✅ train added to scene');

    }, undefined, (error) => {
        console.error('Error loading train:', error);
    });
}

/* ------------------ SUBWAY PASSENGER SYSTEM ------------------ */

function spawnSubwayPassenger() {
    if (subwayPassenger || passengerState !== 'waiting') return; // Already spawned or spawning
    passengerState = 'spawning'; // Set immediately to prevent double-spawn

    loadCharacter({
        path: 'models/blender.glb',
        position: { x: 0, y: 0, z: -5 }, // Near train stop
        scale: 0.6,
        hasAnimation: true,
        hasShadow: true,
        shadowSize: 1.5,
        behavior: 'wander',
        wanderSpeed: 0.015,
        forwardOffset: Math.PI,
        onLoad: (model, charData) => {
            subwayPassenger = charData;
            passengerState = 'wandering';
            console.log('Subway passenger spawned!');
        }
    });
}

function makePassengerBoard() {
    if (!subwayPassenger) return;

    passengerState = 'boarding';

    // Stop wandering behavior
    subwayPassenger.state = 'boarding';
    subwayPassenger.velocity.set(0, 0, 0);

    console.log('Passenger attempting to board train!');
}

function updatePassengerBoarding() {
    if (!subwayPassenger || !subwayPassenger.model || !train) return;

    const boardingX = trainMiddleX; // Train position
    const boardingZ = -8;
    const boardingRadius = 0.5; // How close they need to be

    const dx = boardingX - subwayPassenger.model.position.x;
    const dz = boardingZ - subwayPassenger.model.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Check if train is still at the station
    const trainAtStation = train.visible && Math.abs(train.position.x - trainMiddleX) < 1;

    if (dist > boardingRadius) {
        const speed = 0.04;
        const moveX = (dx / dist) * speed;
        const moveZ = (dz / dist) * speed;

        const nextPos = subwayPassenger.model.position.clone();
        nextPos.x += moveX;
        nextPos.z += moveZ;

        // ✅ Check prop collision before moving
        const propCollision = checkPropCollision(nextPos);

        if (propCollision) {
            // Steer around the prop
            const away = new THREE.Vector3()
                .subVectors(subwayPassenger.model.position, propCollision)
                .normalize();

            // Blend away direction with boarding direction so they still trend toward train
            const boardingDir = new THREE.Vector3(dx, 0, dz).normalize();
            const steerDir = away.clone().add(boardingDir).normalize();

            subwayPassenger.model.position.x += steerDir.x * speed;
            subwayPassenger.model.position.z += steerDir.z * speed;

            const angle = Math.atan2(-steerDir.x, -steerDir.z);
            subwayPassenger.model.rotation.y = angle + Math.PI;
        } else {
            subwayPassenger.model.position.x += moveX;
            subwayPassenger.model.position.z += moveZ;

            const angle = Math.atan2(-dx, -dz);
            subwayPassenger.model.rotation.y = angle + Math.PI;
        }

        if (!trainAtStation) {
            console.log('Passenger missed the train!');
            passengerState = 'wandering';
            subwayPassenger.state = 'walking';
            subwayPassenger.velocity.set(
                (Math.random() - 0.5) * 0.015,
                0,
                (Math.random() - 0.5) * 0.015
            );
        }
    } else {
        // Reached boarding position
        console.log('Passenger successfully boarded!');
        scene.remove(subwayPassenger.model);

        const index = loadedCharacters.indexOf(subwayPassenger);
        if (index > -1) loadedCharacters.splice(index, 1);

        subwayPassenger = null;
        passengerState = 'gone';
    }
}

/* ------------------ CLOCK DISPLAY ------------------ */

function updateClock() {
    const now = new Date();

    // Format date: "02/17/2026"
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const year = now.getFullYear();
    const dateStr = `${month}/${day}/${year}`;

    // Get day of week: "Tuesday"
    const dayOptions = { weekday: 'long' };
    const dayStr = now.toLocaleDateString('en-US', dayOptions);

    // Format time: "3:45 PM"
    const timeOptions = { hour: 'numeric', minute: '2-digit', hour12: true };
    const timeStr = now.toLocaleTimeString('en-US', timeOptions);

    // Update clock element
    const clockElement = document.getElementById('clock');
    if (clockElement) {
        clockElement.innerHTML = `${dateStr} ${dayStr}<br>${timeStr}`;
    }
}

// Update clock every minute (60000 ms)
setInterval(updateClock, 60000);
updateClock(); // Initial call


/* ------------------ CAFE SYSTEM ------------------ */

function visitCafe(char) {
    char.hasVisitedCafe = true;

    // Just stop movement temporarily
    char.velocity.set(0, 0, 0);

    console.log('Character visiting cafe...');

    setTimeout(() => {
        purchaseFood(char);
    }, 1000);
}
function purchaseFood(char) {
    // Pick random food from the list
    const randomFood = CAFE_FOOD_ITEMS[Math.floor(Math.random() * CAFE_FOOD_ITEMS.length)];

    const loader = new GLTFLoader();
    loader.load(randomFood, (gltf) => {
        const foodItem = gltf.scene;

        // Apply materials
        foodItem.traverse((child) => {
            if (child.isMesh) {
                const oldMaterial = child.material;
                const texture = oldMaterial.map;
                if (texture) {
                    texture.minFilter = THREE.NearestFilter;
                    texture.magFilter = THREE.NearestFilter;
                    texture.generateMipmaps = false;
                    texture.colorSpace = THREE.LinearSRGBColorSpace;
                }
                child.material = new THREE.MeshBasicMaterial({
                    map: texture,
                    transparent: oldMaterial.transparent,
                    alphaTest: oldMaterial.alphaTest
                });
            }
        });

        // Scale and position food next to character
        const characterScale = char.config.scale || 0.5;
        foodItem.scale.setScalar(1); 
        foodItem.position.set(1.5 * characterScale, 1.8 * characterScale, 1.5 * characterScale); // Position also scales
        foodItem.rotation.y = Math.PI / 4;

        char.model.add(foodItem);
        char.holdingFood = foodItem;

        const timeUntilEat = Math.random() * (MAX_TIME_BEFORE_EATING - MIN_TIME_BEFORE_EATING) + MIN_TIME_BEFORE_EATING;
        char.eatTime = Date.now() + timeUntilEat;

        console.log(`Character purchased ${randomFood}! Will eat in ${(timeUntilEat / 1000).toFixed(1)} seconds`);

        // JUST SET STATE - let updateWanderBehavior handle the rest
        char.state = 'walking';
        // DON'T touch velocity, moveDir, or rotation - wander will fix it

    }, undefined, (error) => {
        console.error('Error loading food item:', error);
        char.state = 'walking';
    });
}

function checkIfShouldEat(char) {
    // Only check if holding food and it's time to eat
    if (!char.holdingFood || !char.eatTime) return;

    // Can start eating while walking or standing still (but not while doing other things)
    if (Date.now() >= char.eatTime && (char.state === 'walking' || char.state === 'idle')) {
        startEating(char);
    }
}

function startEating(char) {
    char.state = 'eating';
    char.velocity.set(0, 0, 0);
    char.eatingStartTime = Date.now();
    char.eatTime = null; // Clear eat time

    // Face camera
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    const oppositeDirection = cameraDirection.clone().negate();
    const targetAngle = Math.atan2(-oppositeDirection.x, -oppositeDirection.z);
    char.model.rotation.y = targetAngle;

    // Switch to eating animation
    char.playAnimation('eating'); // Or whatever the eating animation is named

    console.log('Character is eating!');
}

function updateEatingBehavior(char) {
    const elapsed = Date.now() - char.eatingStartTime;

    // Keep facing camera while eating
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    const oppositeDirection = cameraDirection.clone().negate();
    const targetAngle = Math.atan2(-oppositeDirection.x, -oppositeDirection.z);
    char.model.rotation.y = targetAngle;

    // Finish eating after duration
    if (elapsed > EATING_DURATION) {
        finishEating(char);
    }
}

function finishEating(char) {
    // Remove food item
    if (char.holdingFood) {
        char.model.remove(char.holdingFood);
        char.holdingFood = null;
    }

    // Resume walking with NEW direction
    char.state = 'walking';
    char.playAnimation('walk');

    const newDir = new THREE.Vector3(
        Math.random() - 0.5,
        0,
        Math.random() - 0.5
    ).normalize();

    char.velocity.copy(newDir).multiplyScalar(char.config.wanderSpeed);
    char.moveDir = newDir.clone();
    char.rotationMode = 'movement';  // ADD THIS

    // Allow visiting cafe again
    char.hasVisitedCafe = false;

    console.log('Character finished eating!');
}


/* ------------------ ANIMATE ------------------ */
function getTrainTimeInfo() {
    const now = Date.now();
    const cycleElapsedMs = now - trainCycleStart;
    const cycleElapsedSec = cycleElapsedMs / 1000;
    return { cycleElapsedSec };
}


function animate() {
    requestAnimationFrame(animate);
    updateStarParticles()
    updateMusicNotes();
    const dt = clock.getDelta();
    const elapsedTime = clock.getElapsedTime();
    if (window.trainMixer) window.trainMixer.update(dt);
    

        // 1️⃣ Update animation mixers (pure animation only)
        loadedCharacters.forEach(char => {
            if (char.mixer) char.mixer.update(dt);
            updateCharacterLighting(char);
            applyRotation(char);
        });

        // 2️⃣ Update movement / state (NO rotation here)
        updateCharacterBehaviors();

        // 3️⃣ Update hover state ONLY (sets flags, no rotation math)
        updateHoverInteraction();

    updateStreetLightGlows();



    // Update sunfish fade effect
    updateSunfishFade(dt);

    if (controls) controls.update();


    // Update wind animation for trees
    scene.traverse((child) => {
        if (child.userData.foliageMaterial) {
            child.userData.foliageMaterial.uniforms.u_windTime.value += dt;
        }
        
    });

    // Cloud rotation
    scene.traverse((child) => {
        if (child.geometry && child.geometry.type === 'SphereGeometry' && child.material.side === THREE.BackSide) {
            child.rotation.y += 0.0005;
        }

        // Water animations for fountain
        if (child.userData.isWaterRadial && child.userData.waterMaterial) {
            child.userData.waterMaterial.uniforms.uTime.value = elapsedTime * 0.5;
        }
        if (child.userData.isWaterFalling && child.userData.fallingTexture) {
            child.userData.fallingTexture.offset.y -= 0.001;
        }
    });

    // Train animation
    if (train) {
        const { cycleElapsedSec } = getTrainTimeInfo();

        const moveDuration = 20;
        const stopDuration = 10;
        const totalPhase = moveDuration + stopDuration;

        // Visit 0: stop + open doors + spawn passenger
        // Visit 1: pass through, no stop
        // Visit 2: stop + close doors (passenger boards or times out)
        const shouldStop = trainVisitCount === 0 || trainVisitCount === 2;

        if (cycleElapsedSec < (shouldStop ? totalPhase : moveDuration)) {
            train.visible = true;

            if (cycleElapsedSec < moveDuration / 2) {
                // Move from START to MIDDLE
                const t = cycleElapsedSec / (moveDuration / 2);
                train.position.lerpVectors(trainStartPos, trainMiddlePos, t);

            } else if (shouldStop && cycleElapsedSec < moveDuration / 2 + stopDuration) {
                // STOP at middle
                train.position.copy(trainMiddlePos);

                const timeIntoStop = cycleElapsedSec - (moveDuration / 2);

                // Visit 0: open doors + spawn passenger
                if (trainVisitCount === 0) {
                    if (timeIntoStop > 0.2 && timeIntoStop < 0.3 && passengerState === 'waiting' && !train._doorsOpened) {
                        train._doorsOpened = true;
                        if (window.trainAnimations?.['doors_opening']) {
                            const action = window.trainAnimations['doors_opening'];
                            window.trainMixer.stopAllAction();
                            action.reset();
                            action.setLoop(THREE.LoopOnce);
                            action.clampWhenFinished = true;
                            action.enabled = true;
                            action.play();
                        }
                        spawnSubwayPassenger();
                    }

                    // Guaranteed close before departing (passenger didn't board this visit)
                    if (timeIntoStop > stopDuration - 1 && train._doorsOpened && !train._doorsClosing) {
                        train._doorsClosing = true;
                        if (window.trainAnimations?.['doors_closing']) {
                            const action = window.trainAnimations['doors_closing'];
                            window.trainMixer.stopAllAction();
                            action.reset();
                            action.setLoop(THREE.LoopOnce);
                            action.clampWhenFinished = true;
                            action.enabled = true;
                            action.play();
                        }
                    }
                }

                // Visit 2: close doors when passenger boards, or force close before departing
                if (trainVisitCount === 2) {
                    if (passengerState === 'wandering' && !train._boardingDelay) {
                        train._boardingDelay = true;
                        makePassengerBoard();
                    }

                    if (timeIntoStop > stopDuration - 1 && !train._doorsClosing) {
                        train._doorsClosing = true;
                        if (window.trainAnimations?.['doors_closing']) {
                            const action = window.trainAnimations['doors_closing'];
                            window.trainMixer.stopAllAction();
                            action.reset();
                            action.timeScale = 0.5;
                            action.setLoop(THREE.LoopOnce);
                            action.clampWhenFinished = true;
                            action.enabled = true;
                            action.play();
                        }
                    }
                }

            } else {
                // Move from MIDDLE to END
                const elapsed = shouldStop ? cycleElapsedSec : cycleElapsedSec;
                const moveStartTime = shouldStop ? moveDuration / 2 + stopDuration : moveDuration / 2;
                const t = (cycleElapsedSec - moveStartTime) / (moveDuration / 2);
                train.position.lerpVectors(trainMiddlePos, trainEndPos, t);

                if (t > 0.1 && passengerState === 'boarding' && subwayPassenger) {
                    subwayPassenger.model.visible = false;
                    passengerState = 'gone';
                }
            }

        } else {
            train.visible = false;

            if (cycleElapsedSec > (shouldStop ? totalPhase : moveDuration) + 5) {
                trainCycleStart = Date.now();
                trainVisitCount++;
                train._doorsClosing = false;
                train._doorsOpened = false;
                train._doorsPlayedMoving = false;

                if (trainVisitCount > 3) {
                    trainVisitCount = 0;
                    passengerState = 'waiting';
                }
            }
        }
    }

    const size = renderer.getSize(new THREE.Vector2());
    pixelAlignFrustum(
        camera,
        size.x / size.y,
        Math.floor(size.x / PIXEL_SIZE),
        Math.floor(size.y / PIXEL_SIZE)
    );

    composer.render();
}

/* ------------------ RESIZE ------------------ */

function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const aspect = w / h;

    camera.left = -VIEW_SIZE * aspect / 2;
    camera.right = VIEW_SIZE * aspect / 2;
    camera.top = VIEW_SIZE / 2;
    camera.bottom = -VIEW_SIZE / 2;
    camera.updateProjectionMatrix();

    renderer.setSize(w, h);
    composer.setSize(w, h);

    if (composer.passes[1] && composer.passes[1].uniforms) {
        composer.passes[1].uniforms.resolution.value.set(w, h, PIXEL_SIZE, PIXEL_SIZE);
    }
}

/* ------------------ PIXEL ALIGN ------------------ */

function pixelAlignFrustum(camera, aspect, pxW, pxH) {
    const worldW = (camera.right - camera.left) / camera.zoom;
    const worldH = (camera.top - camera.bottom) / camera.zoom;

    const pixelW = worldW / pxW;
    const pixelH = worldH / pxH;

    const camPos = new THREE.Vector3();
    camera.getWorldPosition(camPos);

    const camRot = new THREE.Quaternion();
    camera.getWorldQuaternion(camRot);

    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camRot);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camRot);

    const dx = (camPos.dot(right) / pixelW) % 1;
    const dy = (camPos.dot(up) / pixelH) % 1;

    camera.left -= dx * pixelW;
    camera.right -= dx * pixelW;
    camera.top -= dy * pixelH;
    camera.bottom -= dy * pixelH;

    camera.updateProjectionMatrix();
}


/* ------------------ ID CARD SYSTEM ------------------ */

// Load character data
fetch('assets/js/character_data.json')
    .then(response => response.json())
    .then(data => {
        characterData = data;
        console.log('Character data loaded:', characterData);
        
    })
    .catch(error => console.error('Error loading character data:', error));

// Click handler
function onCharacterClick(event) {
    console.log('Click detected!', cardVisible);
    if (cardVisible) return;

    // Update pointer position for this click
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);

    for (const char of loadedCharacters) {
        const intersects = raycaster.intersectObject(char.model, true);

        // console.log('Checking character:', char.config.path, 'Intersects:', intersects.length); // DEBUG

        if (intersects.length > 0) {
            console.log('Character clicked:', char.config.path);
            showIDCard(char);
            break;
        }
    }
}
function hideIDCard() {
    document.getElementById('id-card-overlay').style.display = 'none';
    cardVisible = false;
}

function showIDCard(char) {
    console.log('showIDCard called with:', char);

    if (!characterData) {
        console.log('No characterData loaded!');
        return;
    }

    // Get character key from path
    const pathParts = char.config.path.split('/');
    const filename = pathParts[pathParts.length - 1];
    const charKey = filename.replace('.glb', '');

    const data = characterData[charKey];
    if (!data) {
        console.warn(`No data found for character: ${charKey}`);
        return;
    }
    currentAccentColor = data.accentColor || '#667eea';

    // Apply custom background color
    const card = document.getElementById('id-card');
    if (data.backgroundColor) {
        card.style.background = data.backgroundColor;
    } else {
        card.style.background = '#ffff';
    }

    // Populate left side
    document.querySelector('.character-icon').src = data.characterIcon || '';
    document.querySelector('.project-gif').src = data.projectGif || '';
    document.querySelector('.card-name').textContent = data.characterName || '';
    document.querySelector('.card-date').textContent = "DEVELOPED: " + data.developedDate || '';

    // Populate right side
    document.querySelector('.project-title').textContent = data.projectTitle || '';
    document.querySelector('.project-description').textContent = data.description || '';
    document.querySelector('.learn-more-btn').href = data.projectLink || '#';

    // Apply custom accent color to button and tags
    const accentColor = data.accentColor || 'rgba(255, 255, 255, 0.25)';
    const learnMoreBtn = document.querySelector('.learn-more-btn');
    learnMoreBtn.style.backgroundColor = accentColor;

    // Populate skills with custom accent color
    const skillsContainer = document.querySelector('.skills-container');
    skillsContainer.innerHTML = '';
    if (data.skills && data.skills.length > 0) {
        data.skills.forEach(skill => {
            const skillTag = document.createElement('div');
            skillTag.className = 'skill-tag';
            skillTag.textContent = skill;
            skillTag.style.backgroundColor = accentColor;
            skillsContainer.appendChild(skillTag);
        });
    }

    // Show overlay
    document.getElementById('id-card-overlay').style.display = 'flex';
    cardVisible = true;
}

// Card parallax effect
function updateCardParallax(event) {
    if (!cardVisible) return;

    const card = document.getElementById('id-card');
    const shine = document.querySelector('.card-shine');
    const rect = card.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateX = Math.max(-15, Math.min(15, ((y - centerY) / centerY) * 15));
    const rotateY = Math.max(-15, Math.min(15, ((x - centerX) / centerX) * -15));

    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;

    const shineX = Math.max(0, Math.min(100, (x / rect.width) * 100));
    const shineY = Math.max(0, Math.min(100, (y / rect.height) * 100));
    shine.style.setProperty('--shine-x', `${shineX}%`);
    shine.style.setProperty('--shine-y', `${shineY}%`);
}
// Event listeners
window.addEventListener('click', onCharacterClick);
window.addEventListener('mousemove', updateCardParallax);
document.querySelector('.close-card').addEventListener('click', hideIDCard);
document.getElementById('id-card-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'id-card-overlay') {
        hideIDCard();
    }
});

// Populate mobile projects grid
function populateMobileProjects() {
    if (!characterData) return;

    const grid = document.getElementById('projects-grid');
    if (!grid) return;

    grid.innerHTML = '';

    Object.entries(characterData).forEach(([key, data]) => {
        const card = document.createElement('div');
        card.className = 'project-card-mobile';

        // Apply custom background color
        if (data.backgroundColor) {
            card.style.background = data.backgroundColor;
        }

        card.innerHTML = `
            <img class="project-gif-mobile" src="${data.projectGif || ''}" alt="${data.projectTitle || ''}">
            <div class="card-body">
                <div class="project-title-mobile">${data.projectTitle || ''}</div>
                <div class="project-date-mobile">${"DEVELOPED: " + data.developedDate || ''}</div>
                <div class="skills-mobile">
                    ${(data.skills || []).map(skill =>
                    `<span class="skill-tag-mobile" style="background: ${data.accentColor || 'rgba(255, 255, 255, 0.25)'}">${skill}</span>`
                ).join('')}
                </div>
                <div class="description-mobile">${data.description || ''}</div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <a href="${data.projectLink || '#'}" class="learn-more-mobile" style="background: ${data.accentColor || 'white'}">VIEW PROJECT</a>
                    <img src="images/emiiverse_logo.png" alt="Logo" style="width: 40px; height: 40px; object-fit: contain;">
                </div>
            </div>
        `;

        grid.appendChild(card);
    });
}

// Call after character data loads
fetch('assets/js/character_data.json')
    .then(response => response.json())
    .then(data => {
        characterData = data;
        console.log('✓ Character data loaded:', characterData);
        populateMobileProjects();
    })
    .catch(error => console.error('✗ Error loading character data:', error));

document.addEventListener('click', (e) => {
    const btnEl = e.target.closest('.learn-more-btn');
    if (!btnEl) return;

    e.preventDefault();
    const link = btnEl.href;

    const rect = btnEl.getBoundingClientRect();
    const x = ((rect.left + rect.width / 2) / window.innerWidth) * 100;
    const y = ((rect.top + rect.height / 2) / window.innerHeight) * 100;

    const transition = document.getElementById('project-page-transition');

    if (!transition) {
        window.location.href = link;
        return;
    }

    // Set initial state explicitly
    transition.style.background = currentAccentColor;
    transition.style.clipPath = `circle(0% at ${x}% ${y}%)`;

    console.log('Starting transition from', x, y); // Debug

    // Animate
    gsap.to(transition, {
        clipPath: `circle(150% at ${x}% ${y}%)`,
        duration: 0.6,
        ease: "power2.inOut",
        onStart: () => console.log('Animation started'),
        onComplete: () => {
            console.log('Animation complete, navigating...');
            window.location.href = link;
        }
    });
});
const dropdownBtn = document.getElementById('character-dropdown-btn');
const dropdownMenu = document.getElementById('character-dropdown-menu');


if (dropdownBtn && dropdownMenu) {
    dropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownMenu.classList.toggle('show');
        dropdownBtn.textContent = dropdownMenu.classList.contains('show') ? 'Projects ▼' : 'Projects ▲';
    });

    document.addEventListener('click', (e) => {
        if (!dropdownMenu.contains(e.target) && e.target !== dropdownBtn) {
            dropdownMenu.classList.remove('show');
            dropdownBtn.textContent = 'Projects ▲';
        }
    });

    function populateCharacterDropdown() {
        if (!characterData) return;
        dropdownMenu.innerHTML = '';

        Object.entries(characterData).forEach(([key, data]) => {
            const card = document.createElement('div');
            card.className = 'dropdown-character-card';

            card.innerHTML = `
                <div class="dropdown-char-avatar">
                    <img src="${data.avatar || data.characterIcon|| 'images/default-avatar.png'}"
                         alt="${data.name || key}"
                         onerror="this.style.opacity='0.3'">
                </div>
                <div class="dropdown-char-info">
                    <div class="dropdown-char-name">${data.name || key}</div>
                    <div class="dropdown-char-title">${data.projectTitle || ''}</div>
                    <div class="dropdown-char-tags">
                        ${(data.skills || []).map(skill => `<span class="dropdown-tag">${skill}</span>`).join('')}
                    </div>
                </div>
            `;

            card.addEventListener('click', (e) => {
                dropdownMenu.classList.remove('show');
                dropdownBtn.textContent = 'Characters ▲';

                const x = (e.clientX / window.innerWidth) * 100;
                const y = (e.clientY / window.innerHeight) * 100;

                console.log('click coords:', e.clientX, e.clientY); // debug

                const transition = document.getElementById('project-page-transition');

                if (!transition) {
                    window.location.href = data.projectLink;
                    return;
                }

                transition.style.background = data.accentColor || '#ffffff';
                transition.style.clipPath = `circle(0% at ${x}% ${y}%)`;

                gsap.to(transition, {
                    clipPath: `circle(150% at ${x}% ${y}%)`,
                    duration: 0.6,
                    ease: "power2.in",
                    onComplete: () => {
                        window.location.href = data.projectLink;
                    }
                });
            });

            dropdownMenu.appendChild(card);
        });
    }

    fetch('assets/js/character_data.json')
        .then(r => r.json())
        .then(data => {
            characterData = data;
            populateCharacterDropdown();
        })
        .catch(e => console.error('✗ Error loading character data:', e));

    window.populateCharacterDropdown = populateCharacterDropdown;
}