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

const description = "I'm a senior studying computer science at the University of Michigan with an enthusiasm for creating immersive digital experiences ✩彡 ";
const speed = 40; // Adjust the typing speed (milliseconds per character)

let isTyping = false; // Flag to check if the typewriter is currently running

function typeWriter(newText, element, callback) {
    if (isTyping) return; // If typing is already in progress, do nothing
    isTyping = true; // Set the flag to true
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
    //typeWriter(dialogue[0], "text-display");
};

// Function to update the typewriter with the next text
function updateTypewriterWithNextText() {
    const nextText = dialogue[textCounter];

    // Update the typewriter text
    typeWriter(nextText, "text-display");

    // Increment the counter and loop back to the first text if needed
    textCounter = (textCounter + 1) % dialogue.length;
}

const scene = new THREE.Scene();
// Set the background color using a hex value
scene.background = new THREE.Color(0xBFD0E5);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer();
const mcontainer = document.getElementById('model-container');
renderer.setSize(mcontainer.clientWidth, mcontainer.clientHeight);
renderer.gammaOutput = true;

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
// Orbit Controls
const controls = new OrbitControls(camera, renderer.domElement);

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

    // Update camera aspect ratio
    camera.aspect = newWidth / newHeight;
    camera.updateProjectionMatrix();

    // Update renderer size
    renderer.setSize(newWidth, newHeight);
}

// Create an invisible box around the cellphone
const boxGeometry = new THREE.BoxGeometry(2, 3, 4); // Adjust the size as needed
const boxMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
const invisibleBox = new THREE.Mesh(boxGeometry, boxMaterial);
invisibleBox.position.set(0, 0.5, 0); // Set the desired position
scene.add(invisibleBox);

// Add event listener for dblclick and pass the event object
window.addEventListener('dblclick', (event) => onDoubleClick(event));

// ... Rest of your existing code ...

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

    // Check if there are any intersections
    if (intersects.length > 0) {
        // Update the text in your typewriter element
        updateTypewriterWithNextText();
    }
}
