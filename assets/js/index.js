import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader(); // ← top-level, accessible everywhere

/* ═══════════════════════════════════════
   $1 UNISTROKE RECOGNIZER
   ═══════════════════════════════════════ */
(function () {
    var NumPoints = 64, SquareSize = 250, Origin = { X: 0, Y: 0 },
        Diagonal = Math.sqrt(2 * SquareSize * SquareSize), HalfDiagonal = Diagonal / 2,
        AngleRange = 45, AnglePrecision = 2, Phi = 0.5 * (-1 + Math.sqrt(5));

    function Point(x, y) { this.X = x; this.Y = y; }
    function Rectangle(x, y, w, h) { this.X = x; this.Y = y; this.Width = w; this.Height = h; }

    function Unistroke(name, points) {
        this.Name = name;
        this.Points = Resample(points, NumPoints);
        var r = IndicativeAngle(this.Points);
        this.Points = RotateBy(this.Points, -r);
        this.Points = ScaleTo(this.Points, SquareSize);
        this.Points = TranslateTo(this.Points, Origin);
    }

    function Result(name, score) {
        this.Name = name;
        this.Score = score;
    }

    function DollarRecognizer() {
        this.Unistrokes = [];

        this.AddGesture = function (name, points) {
            this.Unistrokes.push(new Unistroke(name, points));
        };

        this.Recognize = function (points, useProtractor) {
            if (!points || points.length < 2 || this.Unistrokes.length === 0) {
                return new Result("No match", 0);
            }

            points = Resample(points, NumPoints);
            var r = IndicativeAngle(points);
            points = RotateBy(points, -r);
            points = ScaleTo(points, SquareSize);
            points = TranslateTo(points, Origin);

            var b = Infinity, u = -1;

            for (var i = 0; i < this.Unistrokes.length; i++) {
                var d = useProtractor
                    ? OptimalCosineDistance(this.Unistrokes[i].Points, points)
                    : DistanceAtBestAngle(points, this.Unistrokes[i], -AngleRange, AngleRange, AnglePrecision);

                if (d < b) { b = d; u = i; }
            }

            return u === -1
                ? new Result("No match", 0)
                : new Result(this.Unistrokes[u].Name, 1 - b / HalfDiagonal);
        };
    }

    function Resample(points, n) {
        var I = PathLength(points) / (n - 1);
        var D = 0.0;
        var newpoints = [points[0]];

        for (var i = 1; i < points.length; i++) {
            var d = Distance(points[i - 1], points[i]);
            if ((D + d) >= I) {
                var qx = points[i - 1].X + ((I - D) / d) * (points[i].X - points[i - 1].X);
                var qy = points[i - 1].Y + ((I - D) / d) * (points[i].Y - points[i - 1].Y);
                var q = new Point(qx, qy);
                newpoints.push(q);
                points.splice(i, 0, q);
                D = 0.0;
            } else {
                D += d;
            }
        }

        while (newpoints.length < n) {
            newpoints.push(points[points.length - 1]);
        }

        return newpoints;
    }

    function IndicativeAngle(points) {
        var c = Centroid(points);
        return Math.atan2(c.Y - points[0].Y, c.X - points[0].X);
    }

    function RotateBy(points, radians) {
        var c = Centroid(points);
        var cos = Math.cos(radians);
        var sin = Math.sin(radians);
        return points.map(p =>
            new Point(
                (p.X - c.X) * cos - (p.Y - c.Y) * sin + c.X,
                (p.X - c.X) * sin + (p.Y - c.Y) * cos + c.Y
            )
        );
    }

    function ScaleTo(points, size) {
        var B = BoundingBox(points);
        var scale = Math.max(B.Width, B.Height);
        if (scale === 0) return points;
        return points.map(p =>
            new Point(p.X * (size / scale), p.Y * (size / scale))
        );
    }

    function TranslateTo(points, pt) {
        var c = Centroid(points);
        return points.map(p =>
            new Point(p.X + pt.X - c.X, p.Y + pt.Y - c.Y)
        );
    }

    function DistanceAtBestAngle(points, T, a, b, threshold) {
        var x1 = Phi * a + (1 - Phi) * b;
        var f1 = DistanceAtAngle(points, T, x1);
        var x2 = (1 - Phi) * a + Phi * b;
        var f2 = DistanceAtAngle(points, T, x2);

        while (Math.abs(b - a) > threshold) {
            if (f1 < f2) {
                b = x2; x2 = x1; f2 = f1;
                x1 = Phi * a + (1 - Phi) * b;
                f1 = DistanceAtAngle(points, T, x1);
            } else {
                a = x1; x1 = x2; f1 = f2;
                x2 = (1 - Phi) * a + Phi * b;
                f2 = DistanceAtAngle(points, T, x2);
            }
        }
        return Math.min(f1, f2);
    }

    function DistanceAtAngle(points, T, radians) {
        return PathDistance(RotateBy(points, radians), T.Points);
    }

    function Centroid(points) {
        var x = 0, y = 0;
        points.forEach(p => { x += p.X; y += p.Y; });
        return new Point(x / points.length, y / points.length);
    }

    function BoundingBox(points) {
        var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        points.forEach(p => {
            minX = Math.min(minX, p.X); minY = Math.min(minY, p.Y);
            maxX = Math.max(maxX, p.X); maxY = Math.max(maxY, p.Y);
        });
        return new Rectangle(minX, minY, maxX - minX, maxY - minY);
    }

    function PathDistance(a, b) {
        var len = Math.min(a.length, b.length);
        if (len === 0) return Infinity;
        var d = 0;
        for (var i = 0; i < len; i++) d += Distance(a[i], b[i]);
        return d / len;
    }

    function PathLength(points) {
        var d = 0;
        for (var i = 1; i < points.length; i++) d += Distance(points[i - 1], points[i]);
        return d;
    }

    function Distance(p1, p2) {
        var dx = p2.X - p1.X, dy = p2.Y - p1.Y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function OptimalCosineDistance(a, b) {
        var dot = 0, det = 0;
        var len = Math.min(a.length, b.length);
        for (var i = 0; i < len; i++) {
            dot += a[i].X * b[i].X + a[i].Y * b[i].Y;
            det += a[i].X * b[i].Y - a[i].Y * b[i].X;
        }
        return Math.acos(dot / Math.sqrt(dot * dot + det * det));
    }

    window.DollarRecognizer = DollarRecognizer;
    window.DollarPoint = Point;
})();


// ══════════════════════════════════════════
// THREE.JS — INTRO
// ══════════════════════════════════════════

let pileHeight = 3; // starting height for falling stars
let starModel = null;
const spawnedStars = [];
loader.load('models/ghost.glb', (gltf) => {
    starModel = gltf.scene;
    starModel.traverse((child) => {
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
                                transparent: true,
                                opacity: oldMaterial.opacity !== undefined ? oldMaterial.opacity : 1.0,
                            });
                        }
    });

});

let expressionBone;
let faceMaterial;
const TOTAL_ROWS = 4;

(function () {
    function spawnFallingStar(index) {
        if (!starModel) return;

        const star = starModel.clone(true);

        // Random horizontal spread
        star.position.x = (Math.random() - 0.5) * 6;
        star.position.z = (Math.random() - 0.5) * 4;

        // Start high
        star.position.y = 10 + Math.random() * 5;

        scene.add(star);
        spawnedStars.push(star);

        // Delay each star slightly for nicer cascade
        gsap.to(star.position, {
            y: pileHeight,
            duration: 1.2 + Math.random(),
            delay: index * 0.03,
            ease: "power2.in",
            onComplete: () => {
                pileHeight += 2; // stack upward
            }
        });

        // Optional subtle rotation while falling
        gsap.to(star.rotation, {
            y: Math.random() * Math.PI * 4,
            x: Math.random() * Math.PI * 2,
            duration: 1.5,
            ease: "none"
        });
    }

    function clearStars() {
        spawnedStars.forEach((star, index) => {
            gsap.to(star.scale, {
                x: 0,
                y: 0,
                z: 0,
                duration: 0.6,
                delay: index * 0.01,
                ease: "power2.in",
                onComplete: () => {
                    scene.remove(star);
                }
            });
        });

        spawnedStars.length = 0;
        pileHeight = 3; // reset pile
    }

    function eraseStarsQuick() {
        if (spawnedStars.length === 0) return;
        spawnedStars.forEach((star) => {
            scene.remove(star);
        });

        spawnedStars.length = 0;
        pileHeight = 3; // reset pile
    }


    const container = document.getElementById('model-container');
    const canvas = document.getElementById('three-canvas');
    if (!container || !canvas) {
        console.warn('Model container or canvas not found');
        return;
    }

    const W = container.clientWidth, H = container.clientHeight;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, W / H, 0.1, 100);
    camera.position.set(0, 5, 5);

    const group = new THREE.Group();
    let model = null;
    let mixer = null;
    const animations = {};


    function playOneAnimation(name) {
        for (const key in animations) {
            animations[key].stop();
        }

        const action = animations[name];
        if (!action) return;

        action.reset();
        action.setLoop(THREE.LoopOnce);   // play once
        action.clampWhenFinished = true;  // stay on last frame
        action.play();
    }

    loader.load('models/emii.glb', (gltf) => {
        model = gltf.scene;

        console.log('Total animations found:', gltf.animations.length);
        gltf.animations.forEach((clip, index) => {
            console.log(`Animation ${index}:`, clip.name, '| Duration:', clip.duration.toFixed(2) + 's');
        });

        gltf.scene.traverse(obj => {

            if (obj.isBone && obj.name === "face_switch") {
                expressionBone = obj;
            }

            if (obj.isMesh && obj.material.map) {

                const texture = obj.material.map;

                // Only adjust texture settings
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.minFilter = THREE.NearestFilter;
                texture.magFilter = THREE.NearestFilter;
                texture.generateMipmaps = false;


                texture.needsUpdate = true;
                // console.log(obj.name);

                // ONLY capture face material by mesh name
                if (obj.name === "Cube012") {
                    faceMaterial = obj.material;
                    
                }

            }

        });

        // Apply unlit materials with proper color space
        model.traverse((child) => {
            if (child.isMesh) {
                console.log('Mesh:', child.name, '| Material:', child.material.name);
            }
            if (child.isMesh) {
                const oldMaterial = child.material;
                const texture = oldMaterial.map;

                // Setup texture with LINEAR color space
                if (texture) {
                    texture.colorSpace = THREE.SRGBColorSpace;
                    texture.minFilter = THREE.NearestFilter;
                    texture.magFilter = THREE.NearestFilter;
                    texture.generateMipmaps = false;
                    texture.flipY = false;
                    texture.needsUpdate = true;
                }

                // Check if this is the outline material (by name set in Blender)
                if (child.material.name === 'OUTLINE_MAT') {
                    child.material = new THREE.MeshBasicMaterial({
                        color: 0x43424C,

                    });
                } else {
                    let materialColor = new THREE.Color(0xffffff);
                    if (oldMaterial.color) materialColor = oldMaterial.color.clone();

                    child.material = new THREE.MeshBasicMaterial({
                        map: texture,
                        color: materialColor,
                        transparent: oldMaterial.transparent || false,
                        alphaTest: oldMaterial.alphaTest || 0,
                        side: THREE.DoubleSide
                    });
            }
            }
        });

        // Setup animations if they exist
        if (gltf.animations && gltf.animations.length > 0) {
            mixer = new THREE.AnimationMixer(model);

            // Store all animations by name
            gltf.animations.forEach(clip => {
                const action = mixer.clipAction(clip);
                animations[clip.name] = action;
                console.log('Loaded animation:', clip.name);
            });

            // Play idle animation if it exists
            const idleAnim = animations['idle'] || animations['Idle'] || Object.values(animations)[0];
            if (idleAnim) {
                idleAnim.play();
            }
        }

        

        // Add model to group
        group.add(model);
        scene.add(group);

        console.log('Model loaded successfully');
        setExpression(2); // or 3 if you want
    },
        (progress) => {
            console.log('Loading:', (progress.loaded / progress.total * 100).toFixed(0) + '%');
        },
        (error) => {
            console.error('Error loading model:', error);
        });

    
    // Gesture-triggered animations
    const gestureAnimations = {
        circle: () => {
            eraseStarsQuick()
            playOneAnimation('spin');
            gsap.to(group.rotation, {
                y: group.rotation.y + Math.PI * 2,
                duration: 1,
                ease: 'power2.inOut'
            });
        },
        star: () => {
            // Clear previous stars if you want a fresh fall
            clearStars();

            // Spawn new batch
            for (let i = 0; i < 50; i++) {
                spawnFallingStar(i);
            }

            // Play the star animation
            playOneAnimation('star_falling');

            // Clear after 4s
            setTimeout(() => {
                clearStars();
            }, 4000);
        },
        square: () => {
            eraseStarsQuick()
            playOneAnimation('rig_akiijaeAction');

        },
        zigzag: () => {
            eraseStarsQuick()
            playOneAnimation('hello');

        }
    };

    window._triggerModelAnimation = (name) => {
        if (gestureAnimations[name]) gestureAnimations[name]();
    };

    const clock = new THREE.Clock();
    let introVisible = false;


    function animate() {
        if (!introVisible) return;
        requestAnimationFrame(animate);

        const delta = clock.getDelta();

        // Update animation mixer
        if (mixer) mixer.update(delta);

        if (expressionBone && faceMaterial) {
            const z = Math.abs(expressionBone.position.z) * 10;  // take absolute

            console.log("Z:", z);
            // Determine expression index based on thresholds
            let index = 0;
            
            if (z >= 3.27) {
                index = 3;
            } else if (z >= 3.25) {
                index = 2;
            } else if (z >= 3.23) {
                index = 1;
            } else {
                index = 0;
            }

            // Clamp just in case
            index = Math.max(0, Math.min(3, index));

            // // Debug
            //console.log("Z:", z.toFixed(3), "Expression index:", index);

            setExpression(index);
        }


        // Idle floating animation
        const t = clock.getElapsedTime();
        group.position.y = Math.sin(t * 0.8) * 0.02;

        renderer.render(scene, camera);
    }

    const observer = new IntersectionObserver(entries => {
        introVisible = entries[0].isIntersecting;
        if (introVisible) animate();
    }, { threshold: 0.1 });
    observer.observe(canvas);

    window.addEventListener('resize', () => {
        const w = container.clientWidth, h = container.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    });
})();


function setExpression(index) {

    if (!faceMaterial || !faceMaterial.map) {
        console.warn("Face material not ready");
        return;
    }

    // Clamp safely between 0–3
    index = Math.max(0, Math.min(TOTAL_ROWS - 1, index));

    // Convert index to atlas offset
    faceMaterial.map.offset.y =
        index / TOTAL_ROWS

    faceMaterial.map.needsUpdate = true;

    //console.log("Expression set to:", index);
}


// ══════════════════════════════════════════
// GESTURE DRAWING + $1 RECOGNITION
// ══════════════════════════════════════════
(function () {
    const container = document.getElementById('model-container');
    const gc = document.getElementById('gesture-canvas');
    const resultEl = document.getElementById('gesture-result');

    if (!container || !gc || !resultEl) {
        console.warn('Gesture elements not found');
        return; faceMaterial.map.offset.y =
            index / TOTAL_ROWS

        faceMaterial.map.needsUpdate = true;
    }

    function resizeGC() {
        gc.width = container.offsetWidth;
        gc.height = container.offsetHeight;
    }
    resizeGC();
    window.addEventListener('resize', resizeGC);

    const ctx = gc.getContext('2d');
    const recognizer = new window.DollarRecognizer();
    const Pt = (x, y) => new window.DollarPoint(x, y);
    const pts = arr => arr.map(p => Pt(p[0], p[1]));

    recognizer.AddGesture('circle', pts([
        [127, 141], [124, 140], [120, 139], [118, 139], [116, 139], [111, 140], [109, 141], [104, 144], [100, 147],
        [96, 152], [93, 157], [90, 163], [87, 169], [85, 175], [83, 181], [82, 190], [82, 195], [83, 200], [84, 205],
        [88, 213], [91, 216], [96, 219], [103, 222], [108, 224], [111, 224], [120, 224], [133, 223], [142, 221],
        [152, 218], [160, 214], [167, 210], [173, 204], [178, 198], [179, 196], [182, 188], [182, 185], [182, 180],
        [181, 175], [178, 167], [173, 161], [168, 155], [163, 150], [156, 147], [149, 145], [142, 143], [136, 142], [127, 141]
    ]));

    recognizer.AddGesture('star', pts([
        [75, 250], [75, 247], [77, 244], [78, 242], [79, 239], [80, 237], [82, 234], [82, 232], [84, 229], [85, 225],
        [87, 222], [88, 219], [89, 216], [91, 212], [92, 208], [94, 204], [95, 201], [96, 196], [97, 194], [98, 191],
        [100, 185], [102, 182], [104, 178], [106, 174], [108, 171], [110, 168], [111, 166], [113, 163], [116, 158],
        [117, 156], [119, 152], [121, 148], [122, 146], [123, 145], [125, 141], [127, 139], [130, 136], [132, 135],
        [134, 136], [146, 152], [156, 169], [166, 185], [177, 202], [188, 218], [199, 235], [187, 219], [175, 202],
        [165, 186], [155, 169], [146, 153], [133, 134], [148, 134], [167, 135], [186, 136], [204, 136], [221, 137],
        [203, 149], [186, 163], [171, 177], [156, 191], [141, 205], [125, 219]
    ]));

    recognizer.AddGesture('square', pts([
        [50, 50], [150, 50],
        [150, 50], [150, 150],
        [150, 150], [50, 150],
        [50, 150], [50, 50]
    ]));

    recognizer.AddGesture('zigzag', pts([
        [100, 50], [150, 70], [100, 90], [150, 110], [100, 130], [150, 150], [100, 170], [150, 190],
        [130, 80], [100, 100], [130, 120], [100, 140], [130, 160],
        [110, 60], [150, 80], [110, 100], [150, 120], [110, 140], [150, 160], [110, 180]
    ]));

    let drawing = false;
    let points = [];
    let drawnPts = [];

    function getPos(e) {
        const rect = container.getBoundingClientRect();
        const src = e.touches ? e.touches[0] : e;
        return { x: src.clientX - rect.left, y: src.clientY - rect.top };
    }

    function redrawStroke(alpha) {
        ctx.clearRect(0, 0, gc.width, gc.height);
        if (drawnPts.length < 2) return;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#78B8FF';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(drawnPts[0].x, drawnPts[0].y);
        for (let i = 1; i < drawnPts.length; i++) ctx.lineTo(drawnPts[i].x, drawnPts[i].y);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    function startDraw(e) {
        e.preventDefault();
        drawing = true;
        points = [];
        drawnPts = [];
        ctx.clearRect(0, 0, gc.width, gc.height);
        const p = getPos(e);
        points.push(Pt(p.x, p.y));
        drawnPts.push(p);
    }

    function moveDraw(e) {
        if (!drawing) return;
        e.preventDefault();
        const p = getPos(e);
        points.push(Pt(p.x, p.y));
        drawnPts.push(p);
        redrawStroke(1);
    }

    let fadeTimer = null;
    function endDraw() {
        if (!drawing) return;
        drawing = false;

        if (points.length > 10) {
            const result = recognizer.Recognize(points, false);
            console.log('Recognized:', result.Name, '| score:', result.Score.toFixed(2));

            const map = {
                circle: { text: '◯ Circle detected!', anim: 'circle', minScore: 0.70 },  // Circle needs higher score
                star: { text: '★ Star detected!', anim: 'star', minScore: 0.45 },
                square: { text: '□ Square detected!', anim: 'square', minScore: 0.45 },
                zigzag: { text: '〜 Hello!!', anim: 'zigzag', minScore: 0.45 }
            };

            const match = map[result.Name];

            // Check if gesture meets its minimum score
            if (match && result.Score >= match.minScore) {
                resultEl.textContent = match.text;
                window._triggerModelAnimation(match.anim);
            } else {
                resultEl.textContent = 'Try: circle, star, square, or zigzag';
            }

            resultEl.classList.add('visible');
            setTimeout(() => resultEl.classList.remove('visible'), 3000);
        }
        if (fadeTimer) clearInterval(fadeTimer);
        let alpha = 1;
        fadeTimer = setInterval(() => {
            alpha -= 0.07;
            if (alpha <= 0) {
                clearInterval(fadeTimer);
                ctx.clearRect(0, 0, gc.width, gc.height);
                drawnPts = [];
            } else {
                redrawStroke(alpha);
            }
        }, 30);
    }

    container.addEventListener('mousedown', startDraw);
    container.addEventListener('mousemove', moveDraw);
    container.addEventListener('mouseup', endDraw);
    container.addEventListener('mouseleave', endDraw);
    container.addEventListener('touchstart', startDraw, { passive: false });
    container.addEventListener('touchmove', moveDraw, { passive: false });
    container.addEventListener('touchend', endDraw);

    gc.style.pointerEvents = 'none';
    const threeCanvas = document.getElementById('three-canvas');
    if (threeCanvas) threeCanvas.style.pointerEvents = 'none';
})();


// ══════════════════════════════════════════
// GSAP SCROLL ANIMATIONS
// ══════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {

    gsap.registerPlugin(ScrollTrigger);

    // Intro entrance
    gsap.from('.intro-title', { y: 60, opacity: 0, duration: 1.2, ease: 'power3.out', delay: 0.2 });
    gsap.from('.intro-subtitle', { y: 40, opacity: 0, duration: 1.0, ease: 'power3.out', delay: 0.5 });
    gsap.from('.intro-right', { x: 60, opacity: 0, duration: 1.2, ease: 'power3.out', delay: 0.3 });

    // Experience: shoot in from left at 7°, stay tilted on landing
    // all 4 finish by the time section hits top of screen
    ['exp-title', 'exp-1', 'exp-2', 'exp-3'].forEach((id) => {
        gsap.fromTo('#' + id,
            { rotation: 7, x: -window.innerWidth, y: 0, opacity: 0 },
            {
                rotation: 7, x: -50, y: 0, opacity: 1,
                ease: 'none',
                scrollTrigger: {
                    trigger: '#experience',
                    start: 'top bottom',
                    end: 'top top',
                    scrub: 2
                }
            }
        );
    });


    gsap.to('#wave-divider-1', {
        backgroundPosition: '200px 0',
        ease: 'none',
        scrollTrigger: {
            trigger: '#wave-divider-1',
            start: 'top bottom',
            end: 'bottom top',
            scrub: 5,
        }
    });

    gsap.to('#wave-divider-2', {
        backgroundPosition: '200px 0',
        ease: 'none',
        scrollTrigger: {
            trigger: '#awards',
            start: 'top bottom',
            end: 'top top',
            scrub: 5,
        }
    });

    // Skills: 4 cards start offscreen right, pan across to offscreen left
    // runner travels left→right across the visible viewport in sync
    (function () {
        const track = document.getElementById('skills-track');
        const boxes = track.querySelectorAll('.skill-box');

        const boxW = 260 + 24;
        const totalW = boxes.length * boxW;

        // END when last box is fully visible
        const wrapper = document.querySelector('.skills-track-wrapper');
        const wrapperW = wrapper.offsetWidth;

        const endX = wrapperW - totalW;

        gsap.fromTo(
            track,
            { x: 120 }, // keep your original start
            {
                x: endX,
                ease: 'none',
                scrollTrigger: {
                    trigger: '#skills',
                    start: 'top-=100 top',
                    end: '+=300',
                    pin: true,
                    scrub: 3,

                    onUpdate: self => {
                        const runner = document.getElementById('runner-char');
                        const runnerRect = runner.getBoundingClientRect();

                        boxes.forEach(box => {
                            const br = box.getBoundingClientRect();

                            const enter =
                                runnerRect.right > br.left &&
                                runnerRect.left < br.right;

                            const exit =
                                runnerRect.left > br.right + 20 ||
                                runnerRect.right < br.left - 20;

                            if (enter) {
                                box.classList.add('lift');
                            } else if (exit) {
                                box.classList.remove('lift');
                            }
                        });

                        // runner movement stays the same
                        gsap.set(runner, {
                            x: -90 + self.progress * (window.innerWidth + 90)
                        });
                    }
                }
            }
        );
    })();

    // Awards entrance
    gsap.from('.award-item', {
        x: -50, opacity: 0, stagger: 0.15, duration: 0.8,
        ease: 'power3.out',
        scrollTrigger: {
            trigger: '#awards',
            start: 'top 75%',
            toggleActions: 'play none none reverse'
        }
    });

    // About entrance
    gsap.from('.about-image', {
        x: -60, opacity: 0, duration: 1,
        scrollTrigger: { trigger: '#about', start: 'top 80%', toggleActions: 'play none none reverse' }
    });
    gsap.from('.about-text', {
        y: 40, opacity: 0, duration: 1,
        scrollTrigger: { trigger: '#about', start: 'top 80%', toggleActions: 'play none none reverse' }
    });

    // Logo shake on scroll into view
    ScrollTrigger.create({
        trigger: '.about-logo',
        start: 'top 90%',
        once: true,
        onEnter: () => {
            gsap.timeline({ defaults: { ease: 'power2.inOut' } })
                .to('#about-logo-img', { rotation: -6, duration: 0.18 })
                .to('#about-logo-img', { rotation: 6, duration: 0.28 })
                .to('#about-logo-img', { rotation: 0, duration: 0.18 });
        }
    });

}); // end DOMContentLoaded


// ══════════════════════════════════════════
// THREE.JS — AWARDS SECTION MODEL
// ══════════════════════════════════════════
(function () {
    const canvas = document.getElementById('awards-canvas');
    if (!canvas) return;

    const container = canvas.parentElement;
    const W = container.clientWidth, H = container.clientHeight;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;  // ADD THIS
    renderer.toneMapping = THREE.NoToneMapping;        // ADD THIS

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 100);
    camera.position.set(0, 2.6, 4.5);   // Camera above ground
     camera.lookAt(0.5, 2.3, 0);  
    // MISSING DECLARATIONS
    const group = new THREE.Group();
    let model = null;
    let mixer = null;
    const animations = {};
    let expressionBone = null;
    let faceMaterial = null;

    // Load your GLB model
    const loader = new GLTFLoader(); // FIXED: was missing declaration
    loader.load('models/emii.glb', (gltf) => {
        model = gltf.scene;

        gltf.scene.traverse(obj => {
            if (obj.isBone && obj.name === "face_switch") {
                expressionBone = obj;
            }

            if (obj.isMesh && obj.material.map) {
                const texture = obj.material.map;
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.minFilter = THREE.NearestFilter;
                texture.magFilter = THREE.NearestFilter;
                texture.generateMipmaps = false;
                texture.needsUpdate = true;

                if (obj.name === "Cube012") {
                    faceMaterial = obj.material;
                    faceMaterial.map.offset.y = 0.25
                    faceMaterial.map.needsUpdate = true;
                }
            }
        });

        // Apply unlit materials
        model.traverse((child) => {
            if (child.isMesh) {
                const oldMaterial = child.material;
                const texture = oldMaterial.map;

                if (texture) {
                    texture.colorSpace = THREE.SRGBColorSpace;
                    texture.minFilter = THREE.NearestFilter;
                    texture.magFilter = THREE.NearestFilter;
                    texture.generateMipmaps = false;
                    texture.flipY = false;
                    texture.needsUpdate = true;
                }

                if (child.material.name === 'OUTLINE_MAT') {
                    child.material = new THREE.MeshBasicMaterial({
                        color: 0x43424C,
                    });
                } else {
                    let materialColor = new THREE.Color(0xffffff);
                    if (oldMaterial.color) materialColor = oldMaterial.color.clone();

                    child.material = new THREE.MeshBasicMaterial({
                        map: texture,
                        color: materialColor,
                        transparent: oldMaterial.transparent || false,
                        alphaTest: oldMaterial.alphaTest || 0,
                        side: THREE.DoubleSide
                    });
                }
            }
        });

        // Setup animations
        if (gltf.animations && gltf.animations.length > 0) {
            mixer = new THREE.AnimationMixer(model);

            gltf.animations.forEach(clip => {
                const action = mixer.clipAction(clip);
                animations[clip.name] = action;
                console.log('Loaded animation:', clip.name);
            });

            // Play float animation (FIXED: look for float animation)
            const floatAnim = animations['floating']
            if (floatAnim) {
                floatAnim.play();
            }
        }

        group.add(model);
        scene.add(group);

        // Set expression if function exists
        if (typeof setExpression === 'function') {
            setExpression(2);
        }

    },
        (progress) => {
            console.log('Loading:', (progress.loaded / progress.total * 100).toFixed(0) + '%');
        },
        (error) => {
            console.error('Error loading model:', error);
        });

    const clock = new THREE.Clock();
    let awardsAnimating = false;

    function animAwards() {
        if (!awardsAnimating) return;
        requestAnimationFrame(animAwards);

        const delta = clock.getDelta();
        const t = clock.getElapsedTime();

        // Update mixer
        if (mixer) mixer.update(delta);

        // Floating animation with bounce

        group.position.y = Math.sin(t * 1.5) * 0.06;

        renderer.render(scene, camera);
    }

    const observer = new IntersectionObserver(entries => {
        awardsAnimating = entries[0].isIntersecting;
        if (awardsAnimating) animAwards();
    }, { threshold: 0.1 });
    observer.observe(canvas);

    window.addEventListener('resize', () => {
        const w = container.clientWidth, h = container.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    });
})();