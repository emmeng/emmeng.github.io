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

// Train animation variables
const trainStartX = -15;
const trainMiddleX = 0;
const trainEndX = 15;
let trainCycleStart = Date.now();

// Store all loaded models/characters
const loadedCharacters = [];
const loadedProps = [];

// Fountain behavior constants =============
const FOUNTAIN_POS = new THREE.Vector3(0, 0, 0);
const FOUNTAIN_VIEW_RADIUS = 3.5; // Distance to trigger fountain viewing
const FOUNTAIN_VIEW_CHANCE = 0.5; // 50% chance to look when in range
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

// Cafe system constants
const CAFE_POS = new THREE.Vector3(10, 0, -5);
const CAFE_RADIUS = 5; // 3x3 area (radius 1.5)
const CAFE_PURCHASE_CHANCE = 0.8;
const EATING_DURATION = 3000; // How long eating animation lasts (ms)
const MIN_TIME_BEFORE_EATING = 10000; // Min 10 seconds
const MAX_TIME_BEFORE_EATING = 180000; // Max 3 minutes

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

let ambientLight;
let currentAccentColor = '#78B8FF';

let foliageVertexShader = null;

// Load shader file (put this before init() is called, or at top of init())
fetch('assets/js/foliage-vertex.glsl')
    .then(response => response.text())
    .then(shaderCode => {
        foliageVertexShader = shaderCode;
        console.log('✓ Foliage shader loaded');
    })
    .catch(error => {
        console.error('✗ Failed to load shader:', error);
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

/* ------------------ INIT ------------------ */

function setTimeOfDay() {
    const hour = new Date().getHours();

    let tintColor;

    if (hour >= 7 && hour < 17) {
        // DAY - No tint (full brightness)
        tintColor = new THREE.Color(1.0, 1.0, 1.0);
    } else if ((hour >= 17 && hour < 19) || (hour >= 5 && hour < 6)) {
        // EVENING - Warm orange tint
        tintColor = new THREE.Color(1.0, 0.85, 0.7);
    } else {
        // NIGHT - Blue dim tint
        tintColor = new THREE.Color(0.5, 0.6, 0.8);
    }

    // Apply tint to all objects in scene
    scene.traverse((child) => {
        if (child.isMesh && child.material.isMaterial) {
            // Store original color if not stored yet
            if (!child.userData.originalColor) {
                child.userData.originalColor = child.material.color.clone();
            }

            // Multiply original color by tint
            child.material.color.copy(child.userData.originalColor).multiply(tintColor);
        }
    });
}
function init() {
    const container = document.getElementById('plaza-container');

    scene = new THREE.Scene();

    // === TIME-OF-DAY GRADIENT SKY ===
    function getGradientColors() {
        const hour = new Date().getHours();
        if (hour >= 7 && hour < 17) {
            return ["#C3DFFF", "#EEF6FF"];
        } else if ((hour >= 17 && hour < 19) || (hour >= 5 && hour < 6)) {
            return ["#EB9AB6", "#FFB46A"];
        } else {
            return ["#1C145B", "#25476D"];
        }
    }

    const [topColor, bottomColor] = getGradientColors();
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

    // === LIGHTING ===
    ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    setTimeOfDay();

    // === CAMERA & RENDERER ===
    camera = new THREE.OrthographicCamera();
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: false });
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

    const floor = new THREE.Mesh(
        new THREE.BoxGeometry(20, 20, 0.2),
        new THREE.MeshBasicMaterial({
            map: floorTexture,
            color: 0xffffff,
            side: THREE.DoubleSide
        })
    );
    floor.position.y = -0.1;
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    createShadows();

    // === LOAD YOUR SCENE OBJECTS ===

    // Fountain at center
    loadFountain({
        position: { x: 0, y: 0.1, z: 0 },
        scale: 1.5
    });

    // Shushu with wandering behavior
    loadCharacter({
        path: 'models/shushu.glb',
        position: { x: 3, y: 0, z: 3 },
        scale: 0.5,
        hasAnimation: true,
        hasShadow: true,
        shadowSize: 1.5,
        behavior: 'wander',
        wanderSpeed: 0.02,
        wanderBounds: { minX: -9, maxX: 9, minZ: -9, maxZ: 9 },
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
        wanderBounds: { minX: -9, maxX: 9, minZ: -9, maxZ: 9 },
    });

    loadProp({
        path: 'models/carpaccio.glb',
        position: { x: 10, y: 1, z: 10},
        scale: 0.8,
        hasShadow: false
    });

    loadProp({
        path: 'models/jasmine_tea.glb',
        position: { x: 5, y: 2, z: 5 },
        scale: 1,
        hasShadow: false
    });



    loadProp({
        path: 'models/building_center.glb',
        position: { x: 3, y: 0, z: 0 },
        scale: 0.6,
        hasShadow: false
    });

    loadProp({
        path: 'models/hydrangea_bush.glb',
        position: { x: 5, y: 0, z: -5 },
        scale: 0.7,
        hasShadow: false
    });


    loadProp({
        path: 'models/vending_machine.glb',
        position: { x: -8, y: 0, z: -5 },
        scale: 0.7,
        hasShadow: false
    });


    loadTrain();
    loadFluffyTree(5, 0, -3); // Position near fountain

    window.addEventListener('resize', onResize);
    onResize();
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
        color: 0x0032ff
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

// Update hover detection in animate loop
function updateHoverInteraction() {
    raycaster.setFromCamera(pointer, camera);

    // Check all characters
    let newHoveredChar = null;
    for (const char of loadedCharacters) {
        const intersects = raycaster.intersectObject(char.model, true);
        if (intersects.length > 0) {
            newHoveredChar = char;
            break;
        }
    }

    // Handle hover state changes
    if (newHoveredChar !== hoveredCharacter) {
        if (hoveredCharacter) {
            hoveredCharacter.isHovered = false;
            document.body.style.cursor = 'default';
        }
        if (newHoveredChar) {
            newHoveredChar.isHovered = true;
            document.body.style.cursor = 'pointer';
        }
        hoveredCharacter = newHoveredChar;
    }

    // Make hovered character face the camera
    if (hoveredCharacter && hoveredCharacter.state !== 'fountainViewing') {
        const model = hoveredCharacter.model;

        // Get direction from character to camera
        const dir = new THREE.Vector3();
        dir.subVectors(camera.position, model.position);
        dir.y = 0; // Ignore vertical
        dir.normalize();

        // Create a matrix that looks in that direction
        const lookAtMatrix = new THREE.Matrix4();
        lookAtMatrix.lookAt(dir, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0));

        // Extract just the Y rotation
        const euler = new THREE.Euler();
        euler.setFromRotationMatrix(lookAtMatrix);

        // Apply the rotation
        model.rotation.y = euler.y;
    }
}

// Add event listener
window.addEventListener('pointermove', onPointerMove);

/* ------------------ MODULAR CHARACTER LOADER ------------------ */

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
        wanderBounds: { minX: -9, maxX: 9, minZ: -9, maxZ: 9 },
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

                child.material = new THREE.MeshBasicMaterial({
                    map: originalTexture,
                    color: materialColor,
                    side: THREE.DoubleSide,
                    transparent: isTransparent,
                    alphaTest: alphaTest,
                    opacity: oldMaterial.opacity !== undefined ? oldMaterial.opacity : 1.0,
                });

                child.material.needsUpdate = true;

                if (isTransparent) {
                    console.log(`  ✓ Transparent material: ${child.name} (alphaTest: ${alphaTest})`);
                }
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
                if (this.animations[animName]) {
                    const newAction = this.animations[animName];

                    // Only switch if it's a different animation
                    if (this.currentAction !== newAction) {
                        if (this.currentAction) {
                            this.currentAction.fadeOut(fadeTime);
                        }
                        newAction.reset().fadeIn(fadeTime).play();
                        this.currentAction = newAction;
                        console.log(`Switched to: ${animName}`);
                    }
                } else {
                    console.warn(`Animation "${animName}" not found in ${this.config.path}`);
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
        if (!char.config.behavior || char.config.behavior === 'idle') return;

        // Skip subway passenger when they're boarding
        if (char === subwayPassenger && passengerState === 'boarding') {
            return;
        }

        // Check if should start eating
        checkIfShouldEat(char);  // <--- HERE

        // Handle different states
        if (char.state === 'eating') {
            updateEatingBehavior(char);
        } else if (char.config.behavior === 'wander') {
            updateWanderBehavior(char);
        }
    });

    // Handle subway passenger boarding separately
    if (subwayPassenger && passengerState === 'boarding') {
        updatePassengerBoarding();
    }
}

function updateWanderBehavior(char) {
    const model = char.model;
    const bounds = char.config.wanderBounds;
    const speed = char.config.wanderSpeed;

    if (char.isHovered) {
        return;
    }

    // Check distance to fountain
    const distToFountain = model.position.distanceTo(FOUNTAIN_POS);

    // STATE: Walking
    if (char.state === 'walking') {
        // Calculate next position
        const nextPos = model.position.clone();
        nextPos.x += char.velocity.x;
        nextPos.z += char.velocity.z;

        // Check distance to fountain
        const nextDistToFountain = nextPos.distanceTo(FOUNTAIN_POS);

        // Check if near fountain and should view it
        const wasNearFountain = char.wasNearFountain || false;
        const isNearFountain = distToFountain < FOUNTAIN_VIEW_RADIUS;

        

        if (isNearFountain && !wasNearFountain && Math.random() < FOUNTAIN_VIEW_CHANCE) {
            char.state = 'fountainViewing';
            char.fountainViewStartTime = Date.now();
            char.velocity.set(0, 0, 0);
            char.originalRotationY = model.rotation.y;

            // Look at fountain - this uses lookAt which assumes +Z forward
            // Since our model faces +Z at rotation 0, lookAt works directly
            model.lookAt(FOUNTAIN_POS);

            char.playAnimation('shushu_wish');
            triggerSunfishAppearance();
            return;
        }

        char.wasNearFountain = isNearFountain;

        // Check if near cafe and hasn't visited yet
        const distToCafe = model.position.distanceTo(CAFE_POS);
        if (distToCafe < CAFE_RADIUS && !char.hasVisitedCafe && Math.random() < CAFE_PURCHASE_CHANCE) {
            visitCafe(char);
            return;
        }

        // Check collision with fountain
        if (nextDistToFountain < 3) {
            const dirFromFountain = new THREE.Vector3().subVectors(model.position, FOUNTAIN_POS).normalize();
            char.velocity.copy(dirFromFountain.multiplyScalar(speed));
            return;
        }

        // Check collision with props
        const propCollision = checkPropCollision(nextPos);
        if (propCollision) {
            const dirFromProp = new THREE.Vector3().subVectors(model.position, propCollision).normalize();
            char.velocity.copy(dirFromProp.multiplyScalar(speed));
        } else {
            model.position.copy(nextPos);
        }

        // Face movement direction
        // For +Z forward models (rotation.y = 0 faces +Z), use atan2(x, z)
        if (char.velocity.length() > 0.001) {
            // atan2(x, z) gives angle where 0 = +Z, positive = turning toward +X
            const angle = Math.atan2(char.velocity.x, char.velocity.z);
            model.rotation.y = angle;
            char.originalRotationY = model.rotation.y;
        }

        // Bounce off bounds
        if (model.position.x < bounds.minX || model.position.x > bounds.maxX) {
            char.velocity.x *= -1;
            model.position.x = THREE.MathUtils.clamp(model.position.x, bounds.minX, bounds.maxX);
        }
        if (model.position.z < bounds.minZ || model.position.z > bounds.maxZ) {
            char.velocity.z *= -1;
            model.position.z = THREE.MathUtils.clamp(model.position.z, bounds.minZ, bounds.maxZ);
        }
    }

    // STATE: Fountain Viewing
    else if (char.state === 'fountainViewing') {
        const elapsed = Date.now() - char.fountainViewStartTime;
        model.lookAt(FOUNTAIN_POS);

        if (elapsed > FOUNTAIN_VIEW_TIME) {
            char.state = 'walking';
            char.wasNearFountain = false;
            char.velocity.set(
                (Math.random() - 0.5) * speed,
                0,
                (Math.random() - 0.5) * speed
            );
            char.playAnimation('shushu_walk');
        }
    }
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
                    opacity: 0,
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
        onLoad: null
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

                child.material = new THREE.MeshBasicMaterial({
                    map: originalTexture,
                    color: materialColor,
                    side: THREE.DoubleSide,
                    transparent: oldMaterial.transparent || false,
                    opacity: oldMaterial.opacity !== undefined ? oldMaterial.opacity : 1.0,
                });

                child.material.needsUpdate = true;
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

        const textureLoader = new THREE.TextureLoader(loadingManager);
        textureLoader.load('images/tree_alpha.png', (alphaMap) => {
            alphaMap.flipY = false;
            alphaMap.colorSpace = THREE.NoColorSpace;
            alphaMap.needsUpdate = true;

            const customMaterial = new THREE.ShaderMaterial({
                vertexShader: foliageVertexShader,
                fragmentShader: `
            uniform sampler2D alphaMap;
            varying vec2 v_uvs;

            void main() {
                vec4 texColor = texture2D(alphaMap, v_uvs);
                if (texColor.a < 0.5) discard;
                gl_FragColor = vec4(0.247, 0.427, 0.129, 1.0); // #3f6d21
            }
        `,
                uniforms: {
                    u_effectBlend: { value: 1.0 },
                    u_windSpeed: { value: 0.5 },
                    u_windTime: { value: 0.0 },
                    alphaMap: { value: alphaMap }
                },
                transparent: true,
                side: THREE.DoubleSide
            });

            tree.traverse((child) => {
                if (child.isMesh && child.name.toLowerCase().includes('foliage')) {
                    child.material = customMaterial;
                    child.frustumCulled = false;
                }
            });
        });
        scene.add(tree);
        loadedProps.push({
            model: tree,
            config: {
                type: 'fluffyTree',
                scale: 0.8
            }
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
            uStart: { value: trainStartX + 5 },
            uEnd: { value: trainEndX - 5 },
            uFade: { value: 2.0 },
        },
        vertexShader: `
            varying vec3 vPos;
            varying vec2 vUv;
            void main() {
                vPos = (modelMatrix * vec4(position, 1.0)).xyz;
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D uMap;
            uniform float uStart;
            uniform float uEnd;
            uniform float uFade;
            varying vec3 vPos;
            varying vec2 vUv;

            void main() {
                vec4 baseColor = texture2D(uMap, vUv);

                float fadeStart = smoothstep(uStart, uStart + uFade, vPos.x);
                float fadeEnd   = smoothstep(uEnd - uFade, uEnd, vPos.x);

                float alpha = fadeStart * (1.0 - fadeEnd);

                if (alpha < 0.01) discard;

                gl_FragColor = vec4(baseColor.rgb, alpha);
            }
        `,
        transparent: true,
        depthWrite: false,
        depthTest: true,
    });

    loader.load("models/train.glb", (gltf) => {
        train = gltf.scene;

        train.traverse((child) => {
            if (child.isMesh) {
                child.material = trainMaterial;
            }
        });

        train.scale.set(0.8, 0.8, 0.8);
        train.position.set(trainStartX, 0.2, -10);
        train.rotation.y = 0;
        train.visible = false;
        train.renderOrder = 8;

        scene.add(train);
        console.log('Train loaded with dissipation shader');
    }, undefined, (error) => {
        console.error('Error loading train:', error);
    });
}

function getTrainTimeInfo() {
    const now = Date.now();
    const cycleElapsedMs = now - trainCycleStart;
    const cycleElapsedSec = cycleElapsedMs / 1000;
    return { cycleElapsedSec };
}

/* ------------------ SUBWAY PASSENGER SYSTEM ------------------ */

function spawnSubwayPassenger() {
    if (subwayPassenger || passengerState !== 'waiting') return; // Already spawned or spawning
    passengerState = 'spawning'; // Set immediately to prevent double-spawn

    loadCharacter({
        path: 'models/shushu.glb',
        position: { x: 0, y: 0, z: -10 }, // Near train stop
        scale: 0.5,
        hasAnimation: true,
        hasShadow: true,
        shadowSize: 1.5,
        behavior: 'wander',
        wanderSpeed: 0.015,
        wanderBounds: { minX: -6, maxX: 6, minZ: -9, maxZ: -6 },
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
    const boardingZ = -10;
    const boardingRadius = 0.5; // How close they need to be

    const dx = boardingX - subwayPassenger.model.position.x;
    const dz = boardingZ - subwayPassenger.model.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Check if train is still at the station
    const trainAtStation = train.visible && Math.abs(train.position.x - trainMiddleX) < 1;

    if (dist > boardingRadius) {
        // Keep walking toward train
        const speed = 0.04; // Faster boarding speed
        subwayPassenger.model.position.x += (dx / dist) * speed;
        subwayPassenger.model.position.z += (dz / dist) * speed;

        // Face walking direction
        const angle = Math.atan2(-dx, -dz);
        subwayPassenger.model.rotation.y = angle + Math.PI;

        // If train left before reaching it, missed the train!
        if (!trainAtStation) {
            console.log('Passenger missed the train!');
            passengerState = 'wandering';
            subwayPassenger.state = 'walking';
            // Set velocity to walk back to waiting area
            subwayPassenger.velocity.set(
                (Math.random() - 0.5) * 0.015,
                0,
                (Math.random() - 0.5) * 0.015
            );
        }
    } else {
        // Reached boarding position - remove completely
        console.log('Passenger successfully boarded!');
        scene.remove(subwayPassenger.model);

        // Remove from loadedCharacters array
        const index = loadedCharacters.indexOf(subwayPassenger);
        if (index > -1) {
            loadedCharacters.splice(index, 1);
        }

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
    char.velocity.set(0, 0, 0);

    // Look at cafe
    char.model.lookAt(CAFE_POS);

    console.log('Character visiting cafe...');

    // Short delay for "shopping"
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

        // Attach to character
        char.model.add(foodItem);
        char.holdingFood = foodItem;

        // Set random time to eat (10 seconds to 3 minutes from now)
        const timeUntilEat = Math.random() * (MAX_TIME_BEFORE_EATING - MIN_TIME_BEFORE_EATING) + MIN_TIME_BEFORE_EATING;
        char.eatTime = Date.now() + timeUntilEat;

        console.log(`Character purchased ${randomFood}! Will eat in ${(timeUntilEat / 1000).toFixed(1)} seconds`);

        // Resume walking (they now walk while holding food!)
        char.state = 'walking';
        char.velocity.set(
            (Math.random() - 0.5) * char.config.wanderSpeed,
            0,
            (Math.random() - 0.5) * char.config.wanderSpeed
        );
    }, undefined, (error) => {
        console.error('Error loading food item:', error);
        // Still resume walking even if food failed to load
        char.state = 'walking';
        char.velocity.set(
            (Math.random() - 0.5) * char.config.wanderSpeed,
            0,
            (Math.random() - 0.5) * char.config.wanderSpeed
        );
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
    char.playAnimation('shushu_eating'); // Or whatever the eating animation is named

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

    // Resume walking
    char.state = 'walking';
    char.playAnimation('shushu_walk');
    char.velocity.set(
        (Math.random() - 0.5) * char.config.wanderSpeed,
        0,
        (Math.random() - 0.5) * char.config.wanderSpeed
    );

    // Allow visiting cafe again
    char.hasVisitedCafe = false;

    console.log('Character finished eating!');
}



/* ------------------ ANIMATE ------------------ */

function animate() {
    requestAnimationFrame(animate);

    const dt = clock.getDelta();
    const elapsedTime = clock.getElapsedTime();

    // Update all character animations
    loadedCharacters.forEach(char => {
        if (char.mixer) char.mixer.update(dt);
    });

    // Update character behaviors
    updateCharacterBehaviors();

    // Update hover interactions
    updateHoverInteraction();

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
    // Train animation
    if (train) {
        const { cycleElapsedSec } = getTrainTimeInfo();

        const moveDuration = 20;
        const stopDuration = 10;
        const totalPhase = moveDuration + stopDuration;

        if (cycleElapsedSec < totalPhase) {
            train.visible = true;

            if (cycleElapsedSec < moveDuration / 2) {
                const t = cycleElapsedSec / (moveDuration / 2);
                train.position.x = THREE.MathUtils.lerp(trainStartX, trainMiddleX, t);
            } else if (cycleElapsedSec < moveDuration / 2 + stopDuration) {
                train.position.x = trainMiddleX;

                // Spawn passenger 0.2 seconds after train stops (first visit)
                const timeIntoStop = cycleElapsedSec - (moveDuration / 2);
                if (timeIntoStop > 0.2 && timeIntoStop < 0.3 && passengerState === 'waiting' && trainVisitCount === 0) {
                    spawnSubwayPassenger();
                }

                // Check if passenger should board (3rd visit)
                if (passengerState === 'wandering' && trainVisitCount === 2) {
                    makePassengerBoard();
                }
            } else {
                const t = (cycleElapsedSec - (moveDuration / 2 + stopDuration)) / (moveDuration / 2);
                train.position.x = THREE.MathUtils.lerp(trainMiddleX, trainEndX, t);

                // Train leaving with passenger
                if (t > 0.1 && passengerState === 'boarding' && subwayPassenger) {
                    subwayPassenger.model.visible = false;
                    passengerState = 'gone';
                }
            }
        } else {
            train.visible = false;
            if (cycleElapsedSec > totalPhase + 5) {
                trainCycleStart = Date.now();
                trainVisitCount++;

                // Reset cycle after passenger leaves
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

        console.log('Checking character:', char.config.path, 'Intersects:', intersects.length); // DEBUG

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
        duration: 0.7,
        ease: "power2.inOut",
        onStart: () => console.log('Animation started'),
        onComplete: () => {
            console.log('Animation complete, navigating...');
            setTimeout(() => {
                window.location.href = link;
            }, 300);
        }
    });
});
