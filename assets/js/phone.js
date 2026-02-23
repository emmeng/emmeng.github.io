import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.118/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.118/examples/jsm/controls/OrbitControls.js';

// Counter to track the current text
let textCounter = 0;
const dialogue = [
    "*Brring...Brring* Hello? This is Emilee!",
    "It's so nice to meet you! Thank you for checking out my website (≧▽≦)",
    "Fun facts about me?",
    "On my free time I like working on passion projects and 3D modeling!",
    "My favorite shape is a star - especially 4 point stars ✦",
    "And lastly, I love going to aquariums 𓆝 𓆟 𓆞",
    "Feel free to reach out to me at emileemeng@gmail.com! I would love to get to know you! ... Bye Bye!",
    "✦ ✦ ✦"
];

const description = "I'm a XR developer an enthusiasm for creating immersive digital experiences ✩彡 ";
const speed = 40;

let isTyping = false;

function typeWriter(newText, element, callback) {
    if (isTyping) return; 
    isTyping = true;
    const typewriterElement = document.getElementById(element);
    typewriterElement.innerHTML = ''; // Clear existing text
    let i = 0;

    function type() {
        if (i < newText.length) {
            typewriterElement.innerHTML += newText.charAt(i);
            i++;
            setTimeout(type, speed);
        } else {
            isTyping = false; // Reset the flag when typing is complete
            if (callback) {
                callback(); // Call the callback function when typing is complete
            }
        }
    }

    type();
}

function updateTypewriter(newText, element) {
    const typewriterElement = document.getElementById(element);
    typewriterElement.innerHTML = newText;
}

function typeWriter1(newText, element, callback) {
    const typewriterElement = document.getElementById(element);
    typewriterElement.innerHTML = ''; // Clear existing text
    let i = 0;

    function type() {
        if (i < newText.length) {
            typewriterElement.innerHTML += newText.charAt(i);
            i++;
            setTimeout(type, speed);
        } else {
            if (callback) {
                callback(); // Call the callback function when typing is complete
            }
        }
    }

    type();
}

// Start the typewriter effect when the page loads
window.onload = function () {
    typeWriter1(description, "desc");
};

// Function to update the typewriter with the next text
function updateTypewriterWithNextText() {
    const nextText = dialogue[textCounter];
    typeWriter(nextText, "text-display");
    textCounter = (textCounter + 1) % dialogue.length;
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xE7F1FD);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer();
const mcontainer = document.getElementById('model-container');
renderer.setSize(mcontainer.clientWidth, mcontainer.clientHeight);
renderer.outputEncoding = THREE.sRGBEncoding; 

mcontainer.appendChild(renderer.domElement);

// Model
const loader = new GLTFLoader();
let cellphone;

loader.load('images/cellphone.glb', (gltf) => {
    cellphone = gltf.scene;
     cellphone.rotation.y = -Math.PI / 5;
    scene.add(cellphone);
});

camera.position.z = 4.2;
const controls = new OrbitControls(camera, renderer.domElement);
controls.minDistance = 4.2;
controls.maxDistance = 4.2;

// Animation
function animate() {
    requestAnimationFrame(animate);

    if (cellphone) {
        cellphone.rotation.y += 0.004;
        invisibleBox.rotation.y += 0.004;
    }

    renderer.render(scene, camera);
}

animate();

// Update renderer size on window resize
window.addEventListener('resize', onWindowResize, false);

function onWindowResize() {
    const newWidth = mcontainer.clientWidth;
    const newHeight = mcontainer.clientHeight;

    camera.aspect = newWidth / newHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(newWidth, newHeight);
}

// Create an invisible box around the cellphone
const boxGeometry = new THREE.BoxGeometry(2, 3, 4); // Adjust the size as needed
const boxMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
const invisibleBox = new THREE.Mesh(boxGeometry, boxMaterial);
invisibleBox.position.set(0, 0.5, 0); // Set the desired position
scene.add(invisibleBox);

window.addEventListener('dblclick', (event) => {
  // Only handle double-click if it's on the phone model container
  const rect = mcontainer.getBoundingClientRect();
  const isInPhoneArea = event.clientX >= rect.left && 
                        event.clientX <= rect.right && 
                        event.clientY >= rect.top && 
                        event.clientY <= rect.bottom;
  
  if (isInPhoneArea) {
    event.stopPropagation(); // Prevent plaza scene from handling this event
    onDoubleClick(event);
  }
});

function onDoubleClick(event) {
    // calculate mouse coordinates in normalized device coordinates
    const mouse = new THREE.Vector2();
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // update the picking ray with the camera and mouse position
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    // calculate objects intersecting the picking ray
    const intersects = raycaster.intersectObject(invisibleBox);

    if (intersects.length > 0) {
        updateTypewriterWithNextText();
    }
}
