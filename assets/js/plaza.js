// === LOADERS ===
const textureLoader = new THREE.TextureLoader();
const gltfLoader = new THREE.GLTFLoader();

// === CONFIG VARIABLES ===
const benchSitTime = 10000;
const vendingStopTime = 10000;
const fountainViewTime = 10000;
const cubeSpeed = 0.02;

// Outline configuration
const outlineConfig = {
  edgeThickness: 20.0, // Default thickness, you can change this
  edgeStrength: 4.0,
  pulsePeriod: 0
};

// Dither configuration
const ditherConfig = {
  enabled: true,
  closeDistance: 3.0, // Distance at which dithering starts
  maxOpacity: 0.3,    // Maximum transparency when very close
  minOpacity: 1.0,    // Minimum transparency when far
  ditherScale: 4.0    // Scale of the dither pattern
};

// === SCENE, CAMERA, RENDERER ===
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
const renderer = new THREE.WebGLRenderer({ antialias: true, stencil:true });
const container = document.getElementById("plaza-container");
const containerWidth = container.clientWidth;
const containerHeight = containerWidth * 0.625; // Slightly shorter aspect ratio
renderer.setSize(containerWidth, containerHeight);
container.appendChild(renderer.domElement);

// Add rounded corners to the container
container.style.borderRadius = "12px";
container.style.overflow = "hidden";

// === CONTROLS ===
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 2;
controls.minDistance = 5;
controls.maxDistance = 20;

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
function setGradientBackground() {
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
}
setGradientBackground();

// === ROTATING CLOUD SPHERE ===
const cloudTexture = new THREE.TextureLoader().load("images/cloud_testing.png");
const cloudSphere = new THREE.Mesh(
  new THREE.SphereGeometry(500, 32, 32),
  new THREE.MeshBasicMaterial({
    map: cloudTexture,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.6,
  })
);
cloudSphere.renderOrder = 9
scene.add(cloudSphere);

// === GROUND ===
const floorTexture = new THREE.TextureLoader().load("models/textures/plaza_tiles.png");
floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
floorTexture.repeat.set(6, 6);

let groundWidth = 20
let groundDepth = 20

const floor = new THREE.Mesh(
  new THREE.BoxGeometry(groundWidth, groundDepth, 0.2),
  new THREE.MeshStandardMaterial({ 

    map: floorTexture,
    color: 0xdddddd
  })
);
floor.position.y = -0.1;
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// === WATER TEXTURE ===
const waterFallingTexture = textureLoader.load("models/textures/water_t4.png");
waterFallingTexture.wrapS = waterFallingTexture.wrapT = THREE.RepeatWrapping;

const waterRadialTexture = textureLoader.load("models/textures/water_t1.png");
waterRadialTexture.wrapS = waterRadialTexture.wrapT = THREE.RepeatWrapping;
waterRadialTexture.center.set(0.5, 0.5); // swirl around center


// === FOUNTAIN ===
gltfLoader.load("models/fountain.glb", (gltf) => {
  const fountain = gltf.scene;
  fountain.scale.set(1, 1, 1);
  fountain.position.set(0, 0.1, 0); // center of plaza
  scene.add(fountain);

  // apply water texture
  fountain.traverse((child) => {
      if (child.isMesh && child.material) {
          const matName = child.material.name.toLowerCase();

          if (matName.includes("radial")) {
              child.material = waterMaterial;
          }
          else if (matName.includes("down")) {
             child.position.y += 0.001;
              child.material = new THREE.MeshStandardMaterial({
                map: waterFallingTexture,
                transparent: true,
                opacity: 0.8,
              }) }
          else if (matName.includes("lower")) {
             child.position.y += 0.01;
              child.material = new THREE.MeshStandardMaterial({
                  color: 0x3399ff,
                  transparent: true,
                  opacity: 0.5,
                  roughness: 0.2,
                  metalness: 0.1
              });
          }
      }
  });
});

// === BENCH ===
const bench = new THREE.Mesh(
  new THREE.BoxGeometry(2, 0.5, 0.5),
  new THREE.MeshStandardMaterial({ color: 0x8b4513 })
);
bench.position.set(0, 0.25, -5);
scene.add(bench);
let benchOccupied = false;

// === VENDING MACHINE ===
const vending = new THREE.Mesh(
  new THREE.BoxGeometry(1.5, 3, 1),
  new THREE.MeshStandardMaterial({ color: 0xff0000 })
);
vending.position.set(9, 1.5, 0);
scene.add(vending);
let vendingOccupied = false;

// === CHARACTERS ===
const characters = [];
const velocities = [];
const states = [];
const headSprites = [];
const fountainViewingTimes = []; // Track when each character started viewing fountain

function randomVelocity() {
  return new THREE.Vector3(
    (Math.random() - 0.5) * cubeSpeed,
    0,
    (Math.random() - 0.5) * cubeSpeed
  );
}

// Function to generate safe spawn positions avoiding objects
function getSafeSpawnPosition() {
  const maxAttempts = 50;
  const plazaSize = 9; // Plaza radius
  
  // Object positions and their safe distances
  const obstacles = [
    { pos: new THREE.Vector3(0, 0, 0), radius: 2.0, name: "fountain" }, // Fountain center
    { pos: new THREE.Vector3(0, 0, -5), radius: 1.5, name: "bench" },   // Bench
    { pos: new THREE.Vector3(9, 0, 0), radius: 1.5, name: "vending" }   // Vending machine
  ];
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Generate random position within plaza bounds
    const x = (Math.random() - 0.5) * plazaSize * 2;
    const z = (Math.random() - 0.5) * plazaSize * 2;
    const position = new THREE.Vector3(x, 0.5, z);
    
    // Check if position is safe (not too close to any obstacle)
    let isSafe = true;
    for (const obstacle of obstacles) {
      const distance = Math.hypot(
        position.x - obstacle.pos.x,
        position.z - obstacle.pos.z
      );
      if (distance < obstacle.radius) {
        isSafe = false;
        break;
      }
    }
    
    if (isSafe) {
      return position;
    }
  }
  
  // Fallback: return a position far from center if all attempts fail
  console.warn("Could not find safe spawn position, using fallback");
  return new THREE.Vector3(
    (Math.random() - 0.5) * 6 + (Math.random() > 0.5 ? 6 : -6),
    0.5,
    (Math.random() - 0.5) * 6 + (Math.random() > 0.5 ? 6 : -6)
  );
}
for (let i = 0; i < 6; i++) {
  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({
      color: Math.random() * 0xffffff,
      emissive: 0x000000,
      emissiveIntensity: 0.0,
    })
  );
  // Use safe spawn position to avoid objects
  const safePosition = getSafeSpawnPosition();
  cube.position.copy(safePosition);
  scene.add(cube);

  characters.push(cube);
  velocities.push(randomVelocity());
  states.push("walking");
  fountainViewingTimes.push(0);

  const spriteMap = new THREE.TextureLoader().load("images/aliens_icon.png");
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: spriteMap, transparent: true })
  );
  sprite.scale.set(1.5, 1.5, 1.5);
  sprite.position.set(0, 1.5, 0);
  sprite.visible = false;
  cube.add(sprite);
  headSprites.push(sprite);
}

// === DITHER TEXTURE ===
const ditherTexture = new THREE.TextureLoader().load("models/textures/bayer8_dither.png");
ditherTexture.minFilter = THREE.NearestFilter;
ditherTexture.magFilter = THREE.NearestFilter;
ditherTexture.wrapS = THREE.RepeatWrapping;
ditherTexture.wrapT = THREE.RepeatWrapping;
function makeDitherMaterial(baseTexture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: baseTexture },
      uDither: { value: ditherTexture },
      uCameraPos: { value: new THREE.Vector3() },
      uCloseDist: { value: 0.03 },   // where fading starts
      uFarDist: { value: 5.0 },    // fully opaque distance
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPos;

      void main() {
        vUv = uv;

        // calculate world position
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform sampler2D uDither;
      uniform vec3 uCameraPos;
      uniform float uCloseDist;
      uniform float uFarDist;

      varying vec2 vUv;
      varying vec3 vWorldPos;

      void main() {
        vec4 baseColor = texture2D(uMap, vUv);
        

        float dist = distance(vWorldPos, uCameraPos);
        float fade = smoothstep(uCloseDist, uFarDist, dist);

        // sample Bayer texture (tiled)
        vec2 dUv = gl_FragCoord.xy / 4.0; // divide to control density
        float dither = texture2D(uDither, dUv).r;

        float alpha = step(dither, fade);

        if (alpha < 0.01) discard; // fully transparent → skip
        gl_FragColor = vec4(baseColor.rgb, baseColor.a * alpha);
      }
    `,
    transparent: true,
  });
}


const lampTexture = new THREE.TextureLoader().load("models/textures/pink_gingham 1.png");


gltfLoader.load("models/lamp.glb", (gltf) => {
   const lamp = gltf.scene;
  lamp.traverse((child) => {
    if (child.isMesh) {
      child.material.dispose(); 
      child.material = makeDitherMaterial(lampTexture);
    }
  });

  lamp.position.set(-6, 0, -7);
  scene.add(lamp);
  
});


// === LIGHTS ===
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(5, 10, 5);
scene.add(dirLight);

camera.position.set(0, 8, 12);
controls.update();

// === POSTPROCESSING (composer + pixelPass + outlinePass) ===
const composer = new THREE.EffectComposer(renderer);
const renderPass = new THREE.RenderPass(scene, camera);
composer.addPass(renderPass);

const pixelPass = new THREE.ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(window.innerWidth, window.innerWidth) },
    cameraDistance: { value: 10.0 },
    ditherEnabled: { value: ditherConfig.enabled ? 1.0 : 0.0 },
    closeDistance: { value: ditherConfig.closeDistance },
    maxOpacity: { value: ditherConfig.maxOpacity },
    minOpacity: { value: ditherConfig.minOpacity },
    ditherScale: { value: ditherConfig.ditherScale }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float cameraDistance;
    uniform float ditherEnabled;
    uniform float closeDistance;
    uniform float maxOpacity;
    uniform float minOpacity;
    uniform float ditherScale;
    varying vec2 vUv;

    // Dither pattern function (Bayer matrix)
    float ditherPattern(vec2 coord) {
      vec2 ditherCoord = coord * ditherScale;
      vec2 grid = floor(ditherCoord);
      vec2 local = fract(ditherCoord);
      
      // 4x4 Bayer matrix
      float bayer4x4[16];
      bayer4x4[0] = 0.0/16.0; bayer4x4[1] = 8.0/16.0; bayer4x4[2] = 2.0/16.0; bayer4x4[3] = 10.0/16.0;
      bayer4x4[4] = 12.0/16.0; bayer4x4[5] = 4.0/16.0; bayer4x4[6] = 14.0/16.0; bayer4x4[7] = 6.0/16.0;
      bayer4x4[8] = 3.0/16.0; bayer4x4[9] = 11.0/16.0; bayer4x4[10] = 1.0/16.0; bayer4x4[11] = 9.0/16.0;
      bayer4x4[12] = 15.0/16.0; bayer4x4[13] = 7.0/16.0; bayer4x4[14] = 13.0/16.0; bayer4x4[15] = 5.0/16.0;
      
      int x = int(mod(grid.x, 4.0));
      int y = int(mod(grid.y, 4.0));
      int index = x + y * 4;
      
      return bayer4x4[index];
    }

    void main() {
      vec4 originalColor = texture2D(tDiffuse, vUv);
      
      if (ditherEnabled < 0.5) {
        gl_FragColor = originalColor;
        return;
      }

      // Calculate distance factor for transparency
      float distanceFactor = max(0.0, (closeDistance - cameraDistance) / closeDistance);
      float targetOpacity = mix(minOpacity, maxOpacity, distanceFactor);
      
      // Apply dither pattern
      float dither = ditherPattern(vUv * resolution);
      float alpha = step(dither, targetOpacity);
      
      gl_FragColor = vec4(originalColor.rgb, originalColor.a * alpha);
    }
  `,
});
composer.addPass(pixelPass);

const outlinePass = new THREE.OutlinePass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  scene,
  camera
);
outlinePass.edgeStrength = outlineConfig.edgeStrength;
outlinePass.edgeGlow = 0; // Set to 0 to remove the bloom/glow effect
outlinePass.edgeThickness = outlineConfig.edgeThickness;
outlinePass.pulsePeriod = outlineConfig.pulsePeriod;
outlinePass.visibleEdgeColor.set('#ffffff');
outlinePass.hiddenEdgeColor.set('#190a05');
composer.addPass(outlinePass);

// Function to update outline thickness
function updateOutlineThickness(thickness) {
  outlineConfig.edgeThickness = thickness;
  outlinePass.edgeThickness = thickness;
}

// Function to toggle dithering effect
function toggleDithering(enabled) {
  ditherConfig.enabled = enabled;
  pixelPass.uniforms.ditherEnabled.value = enabled ? 1.0 : 0.0;
}

// Function to update dithering parameters
function updateDithering(closeDistance, maxOpacity, minOpacity, ditherScale) {
  ditherConfig.closeDistance = closeDistance;
  ditherConfig.maxOpacity = maxOpacity;
  ditherConfig.minOpacity = minOpacity;
  ditherConfig.ditherScale = ditherScale;
  
  pixelPass.uniforms.closeDistance.value = closeDistance;
  pixelPass.uniforms.maxOpacity.value = maxOpacity;
  pixelPass.uniforms.minOpacity.value = minOpacity;
  pixelPass.uniforms.ditherScale.value = ditherScale;
}

// Hover highlight
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let hoverTimeout;
let hoveredCube = null;

let hoveredCubeIndex = null;

renderer.domElement.addEventListener("mousemove", (event) => {
  clearTimeout(hoverTimeout);
  hoverTimeout = setTimeout(() => {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(characters);

    if (intersects.length > 0 && !cardVisible && !helpVisible) {
      const cube = intersects[0].object;
      const cubeIndex = characters.indexOf(cube);

      if (isCubeClickable(cube)) {
        // Stop walking
        if (hoveredCubeIndex !== cubeIndex) {
          // Restore previous hovered cube
          if (hoveredCubeIndex !== null && states[hoveredCubeIndex] === "hovered") {
            states[hoveredCubeIndex] = "walking";
            velocities[hoveredCubeIndex] = randomVelocity();
          }

          hoveredCubeIndex = cubeIndex;
          states[cubeIndex] = "hovered";
          velocities[cubeIndex].set(0, 0, 0);

          // Add outline effect
          hoveredCube = cube;
          outlinePass.selectedObjects = [cube];
        }
      } else {
        // Not clickable or inside fountain, reset hover
        if (hoveredCubeIndex !== null) {
          states[hoveredCubeIndex] = "walking";
          velocities[hoveredCubeIndex] = randomVelocity();
          hoveredCubeIndex = null;
        }
        hoveredCube = null;
        outlinePass.selectedObjects = [];
      }
    } else {
      // No cube hovered
      if (hoveredCubeIndex !== null) {
        states[hoveredCubeIndex] = "walking";
        velocities[hoveredCubeIndex] = randomVelocity();
        hoveredCubeIndex = null;
      }
      hoveredCube = null;
      outlinePass.selectedObjects = [];
    }
  }, 10); // Reduced timeout for more responsive clicking
});




// === TRAIN === choo choo
let train;
let trainStartTime = null;
let trainActive = false;
let trainStopping = false;
const trainDuration = 20; // seconds
const trainStopDuration = 10; //seconds

const trainStartX = (-groundWidth / 2) - 5;
const trainEndX = (groundWidth / 2) + 5;
const trainMiddleX = (trainStartX + trainEndX) / 2;

const trainTexture = new THREE.TextureLoader().load("models/textures/train_256.png");
trainTexture.flipY = false;

const trainMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uMap: { value: trainTexture },
    uStart: { value: trainStartX+5 },
    uEnd: { value: trainEndX-5 },
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

      if (alpha < 0.01) discard; // completely skip nearly transparent pixels

      gl_FragColor = vec4(baseColor.rgb, alpha);
    }
  `,
  transparent: true,
  depthWrite: false, // important! prevents the train from blocking the skybox
  depthTest: true,   // still do depth testing with other objects
});


gltfLoader.load("models/train.glb", (gltf) => {
  train = gltf.scene;
  train.traverse((child) => {
    if (child.isMesh) {
      child.material = trainMaterial; // apply clipping shader to meshes
    }
  });
  train.scale.set(1, 1, 1);
  train.position.set(trainStartX, 0.5, -10);
  train.visible = false;
  train.renderOrder = 8;
  scene.add(train);
});

function getTrainTimeInfo() {
  const now = Date.now();
  const elapsedSec = (now - trainStartTime) / 1000; // absolute time in seconds
  const cycle = 60; // total cycle duration
  const cycleElapsedSec = elapsedSec % cycle; // wraps smoothly
  return { cycleElapsedSec };
}

let specialCharacterOnTrain = true; // whether cube starts on the train
let specialCharacterDisembarked = false;

// Blender character 
let specialCharacter = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0xff0000 })
);
scene.add(specialCharacter);
if (!specialCharacterOnTrain) cube.position.set(platformStart, 0.5, -10);


// === COLLISION HELPERS ===
function horizontalDirBetween(aPos, bPos) {
  const dx = aPos.x - bPos.x;
  const dz = aPos.z - bPos.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) {
    return new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
  }
  return new THREE.Vector3(dx / len, 0, dz / len);
}
function bounceApart(cubeA, cubeB, velA, velB) {
  const dir = horizontalDirBetween(cubeA.position, cubeB.position);
  velA.copy(dir.clone().multiplyScalar(cubeSpeed));
  velB.copy(dir.clone().multiplyScalar(-cubeSpeed));
}
function bounceFromObstacle(cube, vel, obstacle) {
  const dir = horizontalDirBetween(cube.position, obstacle.position);
  vel.copy(dir.multiplyScalar(cubeSpeed));
}

// Fountain collision detection
function checkFountainCollision(cube, vel, cubeIndex) {
  const fountainPos = new THREE.Vector3(0, 0, 0); // Fountain is at center
  const fountainRadius = 4.5; // Radius of fountain collision area
  const fountainInnerRadius = 4; // Inner radius where cubes can't walk through

  const distToFountain = Math.hypot(
    cube.position.x - fountainPos.x,
    cube.position.z - fountainPos.z
  );

  // If cube is inside the inner radius, push it out
  if (distToFountain < fountainInnerRadius) {
    const dir = horizontalDirBetween(cube.position, fountainPos);
    vel.copy(dir.multiplyScalar(cubeSpeed));
    return;
  }

  // If cube is at the outer bounds (between inner and outer radius)
  if (distToFountain >= fountainInnerRadius && distToFountain <= fountainRadius) {
    // 10% chance to stop and look at fountain
    if (Math.random() < 0.1 && states[cubeIndex] === "walking") {
      states[cubeIndex] = "fountainViewing";
      fountainViewingTimes[cubeIndex] = Date.now();
      vel.set(0, 0, 0);

      // Make cube face the fountain
      const dir = horizontalDirBetween(cube.position, fountainPos);
      cube.lookAt(cube.position.x + dir.x, cube.position.y, cube.position.z + dir.z);

      // Resume movement after 10 seconds
      setTimeout(() => {
        if (states[cubeIndex] === "fountainViewing") {
          states[cubeIndex] = "walking";
          velocities[cubeIndex] = randomVelocity();
        }
      }, fountainViewTime);
    } else {
      // Otherwise, bounce away from fountain
      const dir = horizontalDirBetween(cube.position, fountainPos);
      vel.copy(dir.multiplyScalar(cubeSpeed));
    }
  }
}

// Separate function to check if cube is clickable (always clickable unless inside fountain)
function isCubeClickable(cube) {
  const fountainPos = new THREE.Vector3(0, 0, 0);
  const fountainInnerRadius = 1.5; // Only block clicking if actually inside fountain

  const distToFountain = Math.hypot(
    cube.position.x - fountainPos.x,
    cube.position.z - fountainPos.z
  );

  // Only block clicking if cube is actually inside the fountain (not just near it)
  return distToFountain >= fountainInnerRadius;
}

// === CHARACTER DATA ===
const characterData = [
  {
    name: "Alex",
    title: "Software Engineer",
    description: "Passionate about creating innovative solutions and exploring new technologies. Loves working on open-source projects and mentoring junior developers.",
    image: "images/aliens_icon.png"
  },
  {
    name: "Sam",
    title: "UX Designer",
    description: "Creative designer focused on user-centered design and accessibility. Enjoys crafting intuitive interfaces that make technology more human.",
    image: "images/aliens_icon.png"
  },
  {
    name: "Jordan",
    title: "Data Scientist",
    description: "Analytics expert who loves turning complex data into actionable insights. Passionate about machine learning and statistical modeling.",
    image: "images/aliens_icon.png"
  },
  {
    name: "Casey",
    title: "Product Manager",
    description: "Strategic thinker who bridges the gap between technical teams and business goals. Enjoys building products that users love.",
    image: "images/aliens_icon.png"
  },
  {
    name: "Riley",
    title: "DevOps Engineer",
    description: "Infrastructure specialist who ensures systems run smoothly and securely. Loves automating processes and optimizing performance.",
    image: "images/aliens_icon.png"
  },
  {
    name: "Morgan",
    title: "Frontend Developer",
    description: "Creative coder who brings designs to life with clean, responsive code. Passionate about modern web technologies and user experience.",
    image: "images/aliens_icon.png"
  }
];

// === CLICK TO SHOW CARD ===
let cardVisible = false;
let originalCameraPosition = null;
let originalCameraTarget = null;
let isZooming = false;
let currentCharacterIndex = 0;

// === HELP UI ===
let helpVisible = false;

// Create DOM overlay that only covers the plaza container
const overlay = document.createElement("div");
overlay.style.position = "absolute";
overlay.style.left = "0";
overlay.style.top = "0";
overlay.style.width = "100%";
overlay.style.height = "100%";
overlay.style.background = "rgba(0,0,0,0.6)";
overlay.style.display = "none";
overlay.style.alignItems = "center";
overlay.style.justifyContent = "center";
overlay.style.zIndex = "9999";
overlay.style.borderRadius = "8px";
document.getElementById("plaza-container").appendChild(overlay);

// Create ID card content for texture
const cardContent = document.createElement("div");
cardContent.style.background = "white";
cardContent.style.borderRadius = "12px";
cardContent.style.padding = "2rem";
cardContent.style.maxWidth = "400px";
cardContent.style.width = "90%";
cardContent.style.textAlign = "center";
cardContent.style.boxShadow = "0 10px 30px rgba(0,0,0,0.3)";
cardContent.style.position = "relative";
cardContent.style.display = "none"; // Hide HTML version, use for texture
overlay.appendChild(cardContent);

// Character image
const characterImage = document.createElement("img");
characterImage.style.width = "120px";
characterImage.style.height = "120px";
characterImage.style.borderRadius = "50%";
characterImage.style.marginBottom = "1rem";
characterImage.style.objectFit = "cover";
characterImage.style.border = "4px solid #f0f0f0";
cardContent.appendChild(characterImage);

// Character name
const characterName = document.createElement("h2");
characterName.style.margin = "0 0 0.5rem 0";
characterName.style.color = "#333";
characterName.style.fontSize = "1.8rem";
characterName.style.fontWeight = "bold";
cardContent.appendChild(characterName);

// Character title
const characterTitle = document.createElement("h3");
characterTitle.style.margin = "0 0 1rem 0";
characterTitle.style.color = "#666";
characterTitle.style.fontSize = "1.2rem";
characterTitle.style.fontWeight = "normal";
cardContent.appendChild(characterTitle);

// Character description
const characterDescription = document.createElement("p");
characterDescription.style.margin = "0";
characterDescription.style.color = "#555";
characterDescription.style.lineHeight = "1.6";
characterDescription.style.fontSize = "1rem";
cardContent.appendChild(characterDescription);

// Close button
const closeBtn = document.createElement("button");
closeBtn.innerText = "✕";
closeBtn.style.position = "absolute";
closeBtn.style.right = "15px";
closeBtn.style.top = "15px";
closeBtn.style.padding = "8px 12px";
closeBtn.style.fontSize = "18px";
closeBtn.style.background = "rgba(0,0,0,0.1)";
closeBtn.style.border = "none";
closeBtn.style.borderRadius = "50%";
closeBtn.style.cursor = "pointer";
closeBtn.style.width = "40px";
closeBtn.style.height = "40px";
closeBtn.style.display = "flex";
closeBtn.style.alignItems = "center";
closeBtn.style.justifyContent = "center";
cardContent.appendChild(closeBtn);

// Event listeners for closing the card
overlay.addEventListener("click", (e) => {
  if (e.target === overlay) hideCard();
});
closeBtn.addEventListener("click", hideCard);

// Create help button
const helpButton = document.createElement("button");
helpButton.innerHTML = "?";
helpButton.style.position = "absolute";
helpButton.style.bottom = "20px";
helpButton.style.right = "20px";
helpButton.style.width = "50px";
helpButton.style.height = "50px";
helpButton.style.borderRadius = "50%";
helpButton.style.border = "none";
helpButton.style.background = "rgba(0,0,0,0.7)";
helpButton.style.color = "white";
helpButton.style.fontSize = "20px";
helpButton.style.fontWeight = "bold";
helpButton.style.cursor = "pointer";
helpButton.style.zIndex = "10000";
helpButton.style.transition = "all 0.3s ease";
helpButton.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
document.getElementById("plaza-container").appendChild(helpButton);

// Help button hover effects
helpButton.addEventListener("mouseenter", () => {
  helpButton.style.background = "rgba(0,0,0,0.9)";
  helpButton.style.transform = "scale(1.1)";
});

helpButton.addEventListener("mouseleave", () => {
  helpButton.style.background = "rgba(0,0,0,0.7)";
  helpButton.style.transform = "scale(1)";
});

// Create help overlay
const helpOverlay = document.createElement("div");
helpOverlay.style.position = "absolute";
helpOverlay.style.left = "0";
helpOverlay.style.top = "0";
helpOverlay.style.width = "100%";
helpOverlay.style.height = "100%";
helpOverlay.style.background = "rgba(0,0,0,0.8)";
helpOverlay.style.display = "none";
helpOverlay.style.alignItems = "center";
helpOverlay.style.justifyContent = "center";
helpOverlay.style.zIndex = "10001";
helpOverlay.style.borderRadius = "8px";
document.getElementById("plaza-container").appendChild(helpOverlay);

// Create help content
const helpContent = document.createElement("div");
helpContent.style.background = "white";
helpContent.style.borderRadius = "12px";
helpContent.style.padding = "2rem";
helpContent.style.maxWidth = "500px";
helpContent.style.width = "90%";
helpContent.style.maxHeight = "80vh";
helpContent.style.overflowY = "auto";
helpContent.style.boxShadow = "0 20px 40px rgba(0,0,0,0.3)";
helpContent.style.position = "relative";
helpOverlay.appendChild(helpContent);

// Help title
const helpTitle = document.createElement("h2");
helpTitle.textContent = "Plaza Controls & Guide";
helpTitle.style.margin = "0 0 1.5rem 0";
helpTitle.style.color = "#333";
helpTitle.style.fontSize = "1.8rem";
helpTitle.style.fontWeight = "bold";
helpTitle.style.textAlign = "center";
helpContent.appendChild(helpTitle);

// Help sections
const helpSections = [
  {
    title: "🎮 Camera Controls",
    content: "• Mouse: Look around the plaza<br>• Scroll: Zoom in/out<br>• Right-click + drag: Pan camera<br>• Double-click: Reset camera position"
  },
  {
    title: "👥 Character Interactions",
    content: "• Click on any character cube to view their ID card<br>• Characters walk around and interact with objects<br>• Some characters may stop to admire the fountain<br>• Characters can sit on benches and use vending machines"
  },
  {
    title: "🏛️ Plaza Features",
    content: "• Interactive fountain in the center<br>• Bench for characters to rest<br>• Vending machine for character interactions<br>• Train that moves across the plaza<br>• Dynamic lighting that changes with time of day"
  },
  {
    title: "💳 ID Cards",
    content: "• Each character has unique information<br>• Cards appear as 3D objects in the scene<br>• Move your mouse to see parallax effects<br>• Click outside the card or press Escape to close"
  }
];

helpSections.forEach(section => {
  const sectionDiv = document.createElement("div");
  sectionDiv.style.marginBottom = "1.5rem";

  const sectionTitle = document.createElement("h3");
  sectionTitle.innerHTML = section.title;
  sectionTitle.style.margin = "0 0 0.5rem 0";
  sectionTitle.style.color = "#555";
  sectionTitle.style.fontSize = "1.2rem";
  sectionTitle.style.fontWeight = "bold";
  sectionDiv.appendChild(sectionTitle);

  const sectionContent = document.createElement("div");
  sectionContent.innerHTML = section.content;
  sectionContent.style.color = "#666";
  sectionContent.style.lineHeight = "1.6";
  sectionContent.style.fontSize = "1rem";
  sectionDiv.appendChild(sectionContent);

  helpContent.appendChild(sectionDiv);
});

// OK Got It button
const okButton = document.createElement("button");
okButton.textContent = "OK Got It!";
okButton.style.width = "100%";
okButton.style.padding = "12px 24px";
okButton.style.background = "#007bff";
okButton.style.color = "white";
okButton.style.border = "none";
okButton.style.borderRadius = "8px";
okButton.style.fontSize = "1.1rem";
okButton.style.fontWeight = "bold";
okButton.style.cursor = "pointer";
okButton.style.marginTop = "1rem";
okButton.style.transition = "background 0.3s ease";
helpContent.appendChild(okButton);

// OK button hover effect
okButton.addEventListener("mouseenter", () => {
  okButton.style.background = "#0056b3";
});

okButton.addEventListener("mouseleave", () => {
  okButton.style.background = "#007bff";
});

// Help button click handler
helpButton.addEventListener("click", () => {
  helpVisible = true;
  helpOverlay.style.display = "flex";
});

// OK button click handler
okButton.addEventListener("click", () => {
  helpVisible = false;
  helpOverlay.style.display = "none";
});

// Close help when clicking overlay
helpOverlay.addEventListener("click", (e) => {
  if (e.target === helpOverlay) {
    helpVisible = false;
    helpOverlay.style.display = "none";
  }
});

// Create 3D card as thick rectangle cube - 70% of scene
const cardWidth = 6.0; // Larger card
const cardHeight = 4.0; // Larger card
const cardDepth = 0.3; // Thicker depth for cube effect
const cardGeometry = new THREE.BoxGeometry(cardWidth, cardHeight, cardDepth);
// Function to create card texture from HTML content
function createCardTexture(characterData) {
  // Create a temporary canvas
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 800, 600);

  // Add rounded corners effect
  ctx.globalCompositeOperation = 'destination-in';
  ctx.beginPath();
  ctx.roundRect(0, 0, 800, 600, 20);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  // Character image (placeholder circle)
  ctx.fillStyle = '#f0f0f0';
  ctx.beginPath();
  ctx.arc(400, 150, 60, 0, Math.PI * 2);
  ctx.fill();

  // Character name
  ctx.fillStyle = '#333333';
  ctx.font = 'bold 36px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(characterData.name, 400, 250);

  // Character title
  ctx.fillStyle = '#666666';
  ctx.font = '24px Arial';
  ctx.fillText(characterData.title, 400, 290);

  // Character description
  ctx.fillStyle = '#555555';
  ctx.font = '18px Arial';
  ctx.fillText(characterData.description, 400, 350);

  // Create texture from canvas
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// Create a more detailed card material with thickness
const cardMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  metalness: 0.1,
  roughness: 0.3,
  emissive: 0x000000,
});

// Create edge material for the card thickness with subtle gradient
const edgeMaterial = new THREE.MeshStandardMaterial({
  color: 0xe8e8e8,
  metalness: 0.1,
  roughness: 0.6,
  emissive: 0x000000,
});

// Create a subtle edge texture
function createEdgeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  // Create a subtle gradient for the edge
  const gradient = ctx.createLinearGradient(0, 0, 64, 0);
  gradient.addColorStop(0, '#f5f5f5');
  gradient.addColorStop(0.5, '#e0e0e0');
  gradient.addColorStop(1, '#d0d0d0');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// Apply edge texture
const edgeTexture = createEdgeTexture();
edgeMaterial.map = edgeTexture;

// Create the card mesh with different materials for front/back and edges
const cardMesh = new THREE.Mesh(cardGeometry, [
  edgeMaterial, // Right side
  edgeMaterial, // Left side
  edgeMaterial, // Top
  edgeMaterial, // Bottom
  cardMaterial, // Front face
  cardMaterial  // Back face
]);
cardMesh.visible = false;
cardMesh.renderOrder = 999; // Higher render order to always be in front
scene.add(cardMesh);

// Create shine texture with clipping to stay within card bounds
function makeShineTexture() {
  const s = 256;
  const canvas = document.createElement("canvas");
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext("2d");

  // Fill with transparent
  ctx.clearRect(0, 0, s, s);

  // Create a clipping path in the shape of a parallelogram that matches the card
  ctx.save();

  // Define parallelogram points (adjusted to match card dimensions)
  const padding = 20; // Small padding to ensure it stays within card
  const points = [
    { x: padding, y: padding }, // top-left
    { x: s - padding, y: padding }, // top-right
    { x: s - padding - 20, y: s - padding }, // bottom-right (angled)
    { x: padding + 20, y: s - padding } // bottom-left (angled)
  ];

  // Create clipping path
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
  ctx.clip();

  // Rotate to make diagonal
  ctx.translate(s / 2, s / 2);
  ctx.rotate(-0.6); // -34 degrees
  ctx.translate(-s / 2, -s / 2);

  // Make a soft white rectangle with gradient alpha
  const rectW = s * 0.5;
  const rectH = s * 1.2;
  const x = s * 0.25;
  const y = s * -0.15;
  const grad = ctx.createLinearGradient(x, y, x + rectW, y + rectH);
  grad.addColorStop(0, "rgba(255,255,255,0.0)");
  grad.addColorStop(0.45, "rgba(255,255,255,0.25)");
  grad.addColorStop(0.55, "rgba(255,255,255,0.15)");
  grad.addColorStop(1, "rgba(255,255,255,0.0)");
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, rectW, rectH);

  ctx.restore();
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

const shineTexture = makeShineTexture();
const shineMaterial = new THREE.MeshBasicMaterial({
  map: shineTexture,
  transparent: true,
  depthWrite: false,
  opacity: 0.9,
});
const shinePlane = new THREE.Mesh(
  new THREE.PlaneGeometry(cardWidth * 1.1, cardHeight * 1.4),
  shineMaterial
);
shinePlane.renderOrder = 1000;
shinePlane.position.set(0, 0, cardDepth/2 + 0.01); // Position on front face of cube
cardMesh.add(shinePlane);

// Create invisible blocking plane to prevent other interactions
const blockingGeometry = new THREE.PlaneGeometry(cardWidth * 2, cardHeight * 2);
const blockingMaterial = new THREE.MeshBasicMaterial({
  transparent: true,
  opacity: 0,
  side: THREE.DoubleSide
});
const blockingPlane = new THREE.Mesh(blockingGeometry, blockingMaterial);
blockingPlane.position.set(0, 0, cardDepth/2 + 0.05);
blockingPlane.renderOrder = 998;
cardMesh.add(blockingPlane);

// Keep a variable to drive shine position (0..1)
let shineT = -0.5;
let shineSpeed = 0.012;

// Click to show card
renderer.domElement.addEventListener("click", (event) => {
  console.log('Click event triggered');
  if (cardVisible || helpVisible) {
    console.log('Click blocked - card or help visible');
    return;
  }

  // Clear any pending hover timeout to ensure click is processed
  clearTimeout(hoverTimeout);

  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  console.log('Mouse coordinates:', mouse.x, mouse.y);

  // Check if clicking on card first
  const cardIntersects = raycaster.intersectObject(cardMesh);
  if (cardIntersects.length > 0) {
    console.log('Click on card, ignoring');
    return; // Don't process other clicks if clicking on card
  }

  // Get all character intersections and find the closest one
  const intersects = raycaster.intersectObjects(characters);
  console.log('Raycast intersections:', intersects.length);
  
  if (intersects.length > 0) {
    // Find the first clickable character (closest to camera)
    for (let i = 0; i < intersects.length; i++) {
      const character = intersects[i].object;
      console.log('Checking character:', character, 'clickable:', isCubeClickable(character));
      if (isCubeClickable(character)) {
        console.log('Click detected on character:', character);
        showCardForCharacter(character);
        return; // Exit immediately after successful click
      }
    }
    console.log('No clickable characters found');
  } else {
    console.log('No intersections found');
  }
});

// Add mousedown as backup click detection
renderer.domElement.addEventListener("mousedown", (event) => {
  if (cardVisible || helpVisible) return;
  
  // Only process left mouse button
  if (event.button !== 0) return;
  
  console.log('Mouse down event triggered');
  
  // Clear any pending hover timeout
  clearTimeout(hoverTimeout);
  
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  
  const intersects = raycaster.intersectObjects(characters);
  if (intersects.length > 0) {
    for (let i = 0; i < intersects.length; i++) {
      if (isCubeClickable(intersects[i].object)) {
        console.log('Mouse down detected on character:', intersects[i].object);
        showCardForCharacter(intersects[i].object);
        return;
      }
    }
  }
});

// Add double-click detection for better reliability
renderer.domElement.addEventListener("dblclick", (event) => {
  if (cardVisible || helpVisible) return;

  // Clear any pending hover timeout to ensure click is processed
  clearTimeout(hoverTimeout);

  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  const intersects = raycaster.intersectObjects(characters);
  if (intersects.length > 0) {
    for (let i = 0; i < intersects.length; i++) {
      if (isCubeClickable(intersects[i].object)) {
        console.log('Double-click detected on character:', intersects[i].object);
        showCardForCharacter(intersects[i].object);
        break;
      }
    }
  }
});

// Show card function
function showCardForCharacter(character) {
  // Find character index
  const characterIndex = characters.indexOf(character);
  if (characterIndex === -1) return;

  currentCharacterIndex = characterIndex;
  const data = characterData[characterIndex];

  // Remove hover outline when showing card
  if (hoveredCube) {
    hoveredCube = null;
  }
  outlinePass.selectedObjects = [];

  // Create and apply card texture to front and back faces
  const cardTexture = createCardTexture(data);
  cardMaterial.map = cardTexture;
  cardMaterial.needsUpdate = true;

  // Update the materials array
  cardMesh.material = [
    edgeMaterial, // Right side
    edgeMaterial, // Left side
    edgeMaterial, // Top
    edgeMaterial, // Bottom
    cardMaterial, // Front face
    cardMaterial  // Back face
  ];

  cardVisible = true;
  overlay.style.display = "flex";

  // Start smooth zoom out
  smoothZoomOut();

  // Position card after a short delay to allow zoom to start
  setTimeout(() => {
    // Always position card in front of camera, but above ground level
    const distance = 4; // Closer to camera
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const camPos = camera.position.clone();
    const cardPos = camPos.add(dir.multiplyScalar(distance));

    // Ensure card is always above ground level (y > 1)
    if (cardPos.y < 1) {
      cardPos.y = 1;
    }

    cardMesh.position.copy(cardPos);
    cardMesh.quaternion.copy(camera.quaternion);
    cardMesh.visible = true;

    // reset shine
    shineT = -0.6;
    shinePlane.position.x = -cardWidth * 0.8;
  }, 100);
}

// Hide card function
function hideCard() {
  cardVisible = false;
  overlay.style.display = "none";
  cardMesh.visible = false;

  // Start smooth zoom back to original position
  smoothZoomIn();
}

// Smooth camera zoom functions
function smoothZoomOut() {
  if (isZooming) return;
  isZooming = true;

  // Store original camera position and target
  originalCameraPosition = camera.position.clone();
  originalCameraTarget = controls.target.clone();

  // Calculate zoomed out position
  const zoomedPosition = camera.position.clone().multiplyScalar(1.5);
  zoomedPosition.y = Math.max(zoomedPosition.y, 3); // Ensure minimum height

  // Smooth transition
  const startPosition = camera.position.clone();
  const startTime = Date.now();
  const duration = 800; // 0.8 seconds

  function animateZoom() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Smooth easing function
    const easeProgress = 1 - Math.pow(1 - progress, 3);

    camera.position.lerpVectors(startPosition, zoomedPosition, easeProgress);
    controls.update();

    if (progress < 1) {
      requestAnimationFrame(animateZoom);
    } else {
      isZooming = false;
    }
  }

  animateZoom();
}

function smoothZoomIn() {
  if (isZooming || !originalCameraPosition) return;
  isZooming = true;

  const startPosition = camera.position.clone();
  const startTime = Date.now();
  const duration = 800; // 0.8 seconds

  function animateZoom() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Smooth easing function
    const easeProgress = 1 - Math.pow(1 - progress, 3);

    camera.position.lerpVectors(startPosition, originalCameraPosition, easeProgress);
    controls.target.lerpVectors(controls.target, originalCameraTarget, easeProgress);
    controls.update();

    if (progress < 1) {
      requestAnimationFrame(animateZoom);
    } else {
      isZooming = false;
      originalCameraPosition = null;
      originalCameraTarget = null;
    }
  }

  animateZoom();
}

// Close on Escape
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && cardVisible) hideCard();
});

// Parallax effect for card
document.addEventListener("mousemove", (e) => {
  if (!cardVisible) return;
  const nx = (e.clientX / window.innerWidth - 0.5) * 2;
  const ny = (e.clientY / window.innerHeight - 0.5) * 2;

  const tiltX = -ny * 0.2;
  const tiltY = nx * 0.3;
  const baseQuat = camera.quaternion.clone();
  const tiltQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(tiltX, tiltY, 0, "XYZ"));
  cardMesh.quaternion.copy(baseQuat).multiply(tiltQuat);

  shineT = nx * 0.45;
});
const waterUniforms = {
  uTime: { value: 0 },
  uSpeed: { value: 0.1 },
  uTexture: { value: waterRadialTexture },
  uCenter: { value: new THREE.Vector2(0.5, 0.5) } // default center
};

const waterMaterial = new THREE.ShaderMaterial({
  uniforms: waterUniforms,
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

      // convert to polar coords
      float r = length(uv);
      float angle = atan(uv.y, uv.x);

      // animate radius to move OUTWARDS instead of inwards
      float animatedR = fract(r - uTime * uSpeed);

      // convert back into [0,1] UVs
      vec2 polarUv = vec2(animatedR, angle / (2.0 * 3.141592) + 0.5);

      // sample the radial streak texture
      vec4 texColor = texture2D(uTexture, polarUv);

      // fade edges so it blends out smoothly
      float edgeFade = smoothstep(0.95, 0.7, r);

      gl_FragColor = vec4(texColor.rgb, texColor.a * edgeFade);
    }
  `,
  transparent: true,
  depthWrite: false
});

const clock = new THREE.Clock();

// === ANIMATE ===
function animate() {
  requestAnimationFrame(animate);

  cloudSphere.rotation.y += 0.0005;

  scene.traverse((child) => {
    if (child.isMesh && child.material.uniforms?.uCameraPos) {
      child.material.uniforms.uCameraPos.value.copy(camera.position);
    }
  });

  if (waterFallingTexture) {
    waterFallingTexture.offset.y -= 0.001; // simulate downward flow
  }

  waterUniforms.uTime.value = clock.getElapsedTime() * 0.5; // move slower

  // Calculate camera distance for dithering effect
  const cameraDistance = camera.position.length();
  pixelPass.uniforms.cameraDistance.value = cameraDistance;

  // updateTrainClipping();
  
  if (train) {
    const { cycleElapsedSec } = getTrainTimeInfo();

    const moveDuration = 20; // seconds
    const stopDuration = 10; // seconds
    const totalPhase = moveDuration + stopDuration;

    if (cycleElapsedSec < totalPhase) {
      train.visible = true;

      if (cycleElapsedSec < moveDuration / 2) {
        // Phase 1: start → middle
        const t = cycleElapsedSec / (moveDuration / 2);
        train.position.x = THREE.MathUtils.lerp(trainStartX, trainMiddleX, t);
        specialCharacter.visible = specialCharacterOnTrain ? false : true;

      } else if (cycleElapsedSec < moveDuration / 2 + stopDuration) {
        // Phase 2: stop
        train.position.x = trainMiddleX;

        if (specialCharacterOnTrain && !specialCharacterDisembarked) {
          specialCharacter.visible = true;
          specialCharacterDisembarked = true;
          specialCharacterOnTrain = false;
        }

      } else {
        // Phase 3: middle → end
        const t = (cycleElapsedSec - (moveDuration / 2 + stopDuration)) / (moveDuration / 2);
        train.position.x = THREE.MathUtils.lerp(trainMiddleX, trainEndX, t);
        specialCharacter.visible = true;
      }

    } else {
      train.visible = false;
      // Optional reset
      // specialCharacterOnTrain = true;
      // specialCharacterDisembarked = false;
    }
  }



  // Character movement and animations continue regardless of card visibility
  // Only disable hover effects when card is visible
  for (let i = 0; i < characters.length; i++) {
    const cube = characters[i];
    const vel = velocities[i];
    cube.position.y = 0.5;

    if (states[i] === "walking") {
      cube.position.add(vel);

      if (cube.position.x > 10 || cube.position.x < -10) vel.x *= -1;
      if (cube.position.z > 10 || cube.position.z < -10) vel.z *= -1;

      // Check fountain collision
      checkFountainCollision(cube, vel, i);

      for (let j = i + 1; j < characters.length; j++) {
        if (states[j] !== "walking") continue;
        const other = characters[j];
        const dist = Math.hypot(
          cube.position.x - other.position.x,
          cube.position.z - other.position.z
        );
        if (dist < 1.2) {
          headSprites[i].visible = true;
          headSprites[j].visible = true;
          setTimeout(() => { headSprites[i].visible = false; }, 1000);
          setTimeout(() => { headSprites[j].visible = false; }, 1000);
          bounceApart(cube, other, velocities[i], velocities[j]);
        }
      }

      const benchDist = Math.hypot(
        cube.position.x - bench.position.x,
        cube.position.z - bench.position.z
      );
      if (benchDist < 1.2) {
        if (!benchOccupied) {
          states[i] = "sitting";
          benchOccupied = true;
          cube.position.set(bench.position.x, 0.5, bench.position.z);
          velocities[i].set(0, 0, 0);
          setTimeout(() => {
            states[i] = "walking";
            velocities[i] = randomVelocity();
            benchOccupied = false;
            const push = horizontalDirBetween(cube.position, bench.position).multiplyScalar(1.2);
            cube.position.add(push);
            cube.position.y = 0.5;
          }, benchSitTime);
        } else {
          bounceFromObstacle(cube, vel, bench);
        }
      }

      const vendingDist = Math.hypot(
        cube.position.x - vending.position.x,
        cube.position.z - vending.position.z
      );
      if (vendingDist < 1.5) {
        if (!vendingOccupied) {
          states[i] = "vending";
          vendingOccupied = true;
          cube.position.set(vending.position.x, 0.5, vending.position.z + 1);
          velocities[i].set(0, 0, 0);
          setTimeout(() => {
            states[i] = "walking";
            velocities[i] = randomVelocity();
            vendingOccupied = false;
            const push = horizontalDirBetween(cube.position, vending.position).multiplyScalar(1.2);
            cube.position.add(push);
            cube.position.y = 0.5;
          }, vendingStopTime);
        } else {
          bounceFromObstacle(cube, vel, vending);
        }
      }
    }
  }

  // If card is visible, animate card + shine
  if (cardVisible) {
    const distance = 6;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const camPos = camera.position.clone();
    const cardPos = camPos.add(dir.multiplyScalar(distance));
    cardMesh.position.lerp(cardPos, 0.2);

    // glide shine across card toward shineT target
    const targetX = shineT * (cardWidth * 0.9);
    shinePlane.position.x += (targetX - shinePlane.position.x) * 0.15;

    // also slowly slide the shine along
    shineT += shineSpeed * 0.01;
    if (shineT > 1.5) shineT = -1.5;
  } else {
    cardMesh.visible = false;
  }

  controls.update();
  composer.render();
}
animate();

// === RESIZE ===
window.addEventListener("resize", () => {
  const container = document.getElementById("plaza-container");
  const containerWidth = container.clientWidth;
  const containerHeight = containerWidth * 0.625; // Slightly shorter aspect ratio
  camera.aspect = containerWidth / containerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(containerWidth, containerHeight);
  composer.setSize(containerWidth, containerHeight);
  
  // Update pixel pass resolution
  pixelPass.uniforms.resolution.value.set(containerWidth, containerHeight);
});

window.addEventListener("load", () => {
  const splash = document.getElementById("splash-overlay");
  splash.addEventListener("animationend", (e) => {
    if (e.animationName === "fadeOut") splash.remove();
  });
});