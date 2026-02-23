import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.118/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.118/examples/jsm/controls/OrbitControls.js';



// === SCENE SETUP ===
const container = document.getElementById("ocean-container");
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 10);
camera.rotation.set(0, 0, 0); // force upright
scene.background = new THREE.Color(0x001830);


const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

// === CONTROLS ===
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enabled = false; // disable manual control for cursor-follow effect

// === LIGHTING ===
scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
dirLight.position.set(10, 10, 5);
scene.add(dirLight);


const textureLoader = new THREE.TextureLoader();
// === OCEAN PARALLAX (Front Low → Back High) ===
const oceanGroup = new THREE.Group();
scene.add(oceanGroup);

const numLayers = 5;
const oceanColors = [
    0x0a1b3e, // deep navy (closest)
    0x123f7a,
    0x1f63b3,
    0x3794e6,
    0x63c6ff  // bright horizon
];

const oceanLayers = [];
function getViewportSizeAtZ(camera, z) {
    const vFOV = THREE.MathUtils.degToRad(camera.fov); // convert vertical fov to radians
    const height = 2 * Math.tan(vFOV / 2) * Math.abs(z - camera.position.z);
    const width = height * camera.aspect;
    return { width, height };
} const widthMultiplier = 1.2; // make it 20% wider than the frustum

window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);

    // update ocean planes
    oceanLayers.forEach(layer => {
        const size = getViewportSizeAtZ(camera, layer.mesh.position.z);
        layer.mesh.geometry.dispose(); // dispose old geometry
        layer.mesh.geometry = new THREE.PlaneGeometry(size.width, size.height);
    });
});
for (let i = 0; i < numLayers; i++) {
    const color = oceanColors[i];
    const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1.0,
        side: THREE.DoubleSide
    });

    const zPos = 0; // or whatever z you want the plane
    const size = getViewportSizeAtZ(camera, zPos);

    const geo = new THREE.PlaneGeometry(size.width *2, size.height);
    const mesh = new THREE.Mesh(geo, mat);

    // Front (layer 1) is lowest and closest; higher layers rise slightly & recede
    const yOffset = -5 + i; // rises gradually up
    const zOffset = -i * 1.0;     // recedes slightly

    mesh.position.set(0, yOffset, zOffset);
    oceanGroup.add(mesh);

    oceanLayers.push({ mesh, baseY: yOffset, baseZ: zOffset });
}


// === SWIMMING SPRITE ===
const swimTex = textureLoader.load("images/aliens_icon.png");
const swimSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: swimTex, transparent: true, opacity: 0.9 })
);
swimSprite.scale.set(2, 2, 2);
swimSprite.position.set(0, 0.2, 0);
scene.add(swimSprite);

// === CURSOR TRACKING ===
const cursor = new THREE.Vector2(0, 0);
document.addEventListener("mousemove", (e) => {
    cursor.x = (e.clientX / window.innerWidth - 0.5) * 2;
    cursor.y = -(e.clientY / window.innerHeight - 0.5) * 2;
});

const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    // Cursor compression: -1 = bottom, +1 = top
    const compression = THREE.MathUtils.clamp(-cursor.y, -1, 1);

    // Move ocean layers vertically for squash/stretch
    const verticalScale = 6.0
    oceanLayers.forEach((layer, i) => {
        // depthFactor: closer layers move more, farther layers move less
        const depthFactor = 1 - i / (numLayers - 1); // layer 0 = 1 (front), last = 0 (back)
        // vertical offset based on cursor
        const yOffset = layer.baseY + compression * depthFactor * 2.0;

        // optional smooth lerp
        layer.mesh.position.y += (yOffset - layer.mesh.position.y) * 0.1;

        // horizontal drift
        layer.mesh.position.x = Math.sin(t * 0.3 + i) * 0.15;
    });
    // Camera slides slightly, but stays flat
    const targetX = cursor.x * 2.0;
    const targetY = cursor.y * 1.5;
    camera.position.x += (targetX - camera.position.x) * 0.05;
    camera.position.y += (targetY - camera.position.y) * 0.05;

    // Keep rotation fixed
    camera.rotation.set(0, 0, 0);

    // Sprite movement
    const distanceFromCamera = 5; // how far in front of the camera the sprite should be
    const vector = new THREE.Vector3(cursor.x, cursor.y, 0.5); // z doesn't matter much
    vector.unproject(camera);

    // Direction from camera to point
    const dir = vector.sub(camera.position).normalize();
    swimSprite.position.copy(camera.position).add(dir.multiplyScalar(distanceFromCamera));

    // Scale sprite so it looks consistent
    swimSprite.scale.set(1, 1, 1); // adjust size to taste;
    renderer.render(scene, camera);
}
animate();



// === RESIZE ===
window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
