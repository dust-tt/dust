import { RefObject, useEffect } from "react";
import * as THREE from "three";

const hasScrollBehavior = true;

let speed = 0.1;
const postExplodeSpeed = 0.03;
const shapes = [
  { name: "grid", opacity: 1, speed: 0.03 },
  { name: "grid", opacity: 1, speed: 0.03 },
  { name: "wave", opacity: 0.5, speed: 0.01 },
  { name: "bigSphere", opacity: 0.7, speed: 0.03 },
  { name: "sphere", opacity: 0.5, speed: 0.015 },
  { name: "bigCube", opacity: 0.8, speed: 0.03 },
];
//{ name: "cube", opacity: 0.5, speed: 0.03 },
const totalShapes = Object.keys(shapes).length;

let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let particleSystem: THREE.Points;
const backgroundColor = 0x0f172a;
const colorsArray = [
  0x059669, 0x4ade80, 0xf87171, 0xf9a8d4, 0x7dd3fc, 0x3b82f6, 0xfbbf24,
];

const originalSpread = 25; // the random position of Particules at start
let explode = false; // whether to explode the particles
const numParticles = 10000; // number of particles
const particleSize = 0.015; // Size of the particles
const geometricObjectSize = 1.25;
const rotationActive = true; // Activate the rotation of the scene

// Center of the animation
const sceneFocusX = 0;
const sceneFocusY = 0;
const sceneFocusZ = 0;
let currentShape = 0; // 0 = cube, 1 = sphere, etc...;
let targetPositions: { x: number; y: number; z: number }[] = []; // Array to hold the target positions of all particles for each shape

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(backgroundColor);

  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.z = 5;
  camera.position.y = 0;

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  const container = document.getElementById("canvas-container");
  if (container) {
    container.appendChild(renderer.domElement);
  }

  const geometry = new THREE.BufferGeometry();
  const vertices = [];
  const colors = [];
  for (let i = 0; i < numParticles; i++) {
    vertices.push(
      THREE.MathUtils.randFloatSpread(originalSpread), // x
      THREE.MathUtils.randFloatSpread(originalSpread), // y
      THREE.MathUtils.randFloatSpread(originalSpread) // z
    );
    const color = new THREE.Color(
      colorsArray[Math.floor(Math.random() * colorsArray.length)]
    );
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3)
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: particleSize, // Particles size
    vertexColors: true,
    transparent: true,
  });

  particleSystem = new THREE.Points(geometry, material);
  particleSystem.rotation.x = 0.7;
  particleSystem.rotation.y = -0.3;
  particleSystem.rotation.z = 0;
  scene.add(particleSystem);

  // controls = new OrbitControls(camera, renderer.domElement);
  // controls.addEventListener("change", function () {
  //   isDragging = true;
  // });
  // controls.enableDamping = true; // enable inertia
  // controls.dampingFactor = 0.1; // the inertia factor
}

function onWindowResize() {
  // Update camera aspect ratio
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  // Update renderer size
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onKeydown(event: KeyboardEvent) {
  const previousShape = currentShape;

  switch (event.keyCode) {
    case 37: // left arrow key
      currentShape = (currentShape - 1 + totalShapes) % totalShapes;
      break;
    case 39: // right arrow key
      currentShape = (currentShape + 1) % totalShapes;
      break;
  }

  if (currentShape != previousShape) {
    calculateTargetPositions(); // Only calculate target positions when the shape changes
  }
}

function animate() {
  requestAnimationFrame(animate);
  if (rotationActive) {
    particleSystem.rotation.x += 0.0002;
    particleSystem.rotation.y += 0.00005;
    particleSystem.rotation.z += 0.0002;
  }
  if (!explode) {
    animateImplode();
  } else {
    animateExplode();
  }
  particleSystem.geometry.attributes.position.needsUpdate = true;
  renderer.render(scene, camera);
}

function animateImplode() {
  const positions = particleSystem.geometry.attributes.position.array;
  let allParticlesInside = true; // initially assume that all particles are inside the sphere, only used to start the original explosion

  for (let i = 0; i < positions.length; i += 3) {
    const targetPositionX = sceneFocusX;
    const targetPositionY = sceneFocusY;
    const targetPositionZ = sceneFocusZ;
    const currentPositionX = positions[i];
    const currentPositionY = positions[i + 1];
    const currentPositionZ = positions[i + 2];
    const distanceX = currentPositionX - targetPositionX;
    const distanceY = currentPositionY - targetPositionY;
    const distanceZ = currentPositionZ - targetPositionZ;

    const distance3D = Math.sqrt(
      distanceX * distanceX + distanceY * distanceY + distanceZ * distanceZ
    );

    if (distance3D < 0.2) {
      positions[i] = targetPositionX;
      positions[i + 1] = targetPositionY;
      positions[i + 2] = targetPositionZ;
    } else {
      allParticlesInside = false;

      const force =
        (distance3D * speed) / (distance3D * distance3D + Number.EPSILON); // Movement speed

      positions[i] -= force * distanceX;
      positions[i + 1] -= force * distanceY;
      positions[i + 2] -= force * distanceZ;
    }
  }

  if (allParticlesInside && !explode) {
    explode = true;
    speed = postExplodeSpeed;
  }
}

function animateExplode() {
  const positions = particleSystem.geometry.attributes.position.array;

  for (let i = 0; i < positions.length; i += 3) {
    const targetPosition = targetPositions[i / 3]; // Retrieve the pre-calculated target position for this particle

    const currentPositionX = positions[i];
    const currentPositionY = positions[i + 1];
    const currentPositionZ = positions[i + 2];
    const distanceX = targetPosition.x - currentPositionX;
    const distanceY = targetPosition.y - currentPositionY;
    const distanceZ = targetPosition.z - currentPositionZ;

    const distance3D = Math.sqrt(
      distanceX * distanceX + distanceY * distanceY + distanceZ * distanceZ
    );

    if (distance3D > speed) {
      const force =
        (distance3D * speed) / (distance3D * distance3D + Number.EPSILON); // Movement speed
      positions[i] += force * distanceX;
      positions[i + 1] += force * distanceY;
      positions[i + 2] += force * distanceZ;
    } else {
      positions[i] = targetPosition.x;
      positions[i + 1] = targetPosition.y;
      positions[i + 2] = targetPosition.z;
    }
  }
}

function calculateTargetPositions() {
  targetPositions = []; // Reset the target positions

  const opacity = shapes[currentShape].opacity;
  (particleSystem.material as THREE.PointsMaterial).opacity = opacity;

  for (let i = 0; i < numParticles; i++) {
    let targetPositionX = 0,
      targetPositionY = 0,
      targetPositionZ = 0,
      gridSpacing,
      gridX,
      gridY,
      ix,
      iy,
      iz,
      phi,
      theta,
      radius,
      particlesPerSide,
      cubeSize,
      gridSize = 16;

    const gridNum = 48;
    switch (shapes[currentShape].name) {
      case "grid":
        gridSpacing = gridSize / gridNum; // spacing between particles in the grid

        // Calculate indices along x and y axis
        gridX = i % gridNum;
        gridY = Math.floor(i / 3 / gridNum) % gridNum;

        // Calculate positions so that the grid is centered at the origin
        targetPositionX = gridX * gridSpacing - gridSize / 2 + gridSpacing / 2;
        targetPositionY = gridY * gridSpacing - gridSize / 2 + gridSpacing / 2;
        targetPositionZ = 0; // flat grid on the x/y plane
        //console.log('targetPositionX', targetPositionX, 'targetPositionY', targetPositionY, 'targetPositionZ', targetPositionZ);
        break;
      case "wave":
        gridSize = 6;
        gridSpacing = gridSize / gridNum; // spacing between particles in the grid
        const rippleAmplitude = 0.1; // the amplitude of the ripple
        const rippleFrequency = (12 * Math.PI) / gridSize; // the frequency of the ripple

        // Calculate indices along x and y axis
        gridX = i % gridNum;
        gridY = Math.floor(i / 3 / gridNum) % gridNum;

        // Calculate positions so that the grid is centered at the origin
        targetPositionX = gridX * gridSpacing - gridSize / 2 + gridSpacing / 2;
        targetPositionY = gridY * gridSpacing - gridSize / 2 + gridSpacing / 2;

        // Calculate the distance from the center of the grid
        const dx = targetPositionX;
        const dy = targetPositionY;
        const distanceFromCenter = Math.sqrt(dx * dx + dy * dy);

        // Calculate position along z-axis (height of the ripple)
        targetPositionZ =
          rippleAmplitude * Math.sin(rippleFrequency * distanceFromCenter);

        break;
      case "sphere":
        radius = geometricObjectSize * 1.4;
        phi = Math.acos(-1 + (2 * i) / numParticles); // angle for Y
        theta = Math.sqrt(numParticles * Math.PI) * phi; // angle for X and Z

        targetPositionX = radius * Math.cos(theta) * Math.sin(phi);
        targetPositionY = radius * Math.sin(theta) * Math.sin(phi);
        targetPositionZ = radius * Math.cos(phi);
        break;
      case "bigSphere":
        radius = geometricObjectSize * 4;
        phi = Math.acos(-1 + (2 * i) / numParticles); // angle for Y
        theta = Math.sqrt(numParticles * Math.PI) * phi; // angle for X and Z

        targetPositionX = radius * Math.cos(theta) * Math.sin(phi);
        targetPositionY = radius * Math.sin(theta) * Math.sin(phi);
        targetPositionZ = radius * Math.cos(phi);
        break;
      case "cube":
        cubeSize = geometricObjectSize * 3; // size of the cube
        particlesPerSide = Math.cbrt(numParticles); // number of particles per side of the cube

        ix = i % particlesPerSide; // index along x-axis
        iy = Math.floor((i / particlesPerSide) % particlesPerSide); // index along y-axis
        iz = Math.floor(i / (particlesPerSide * particlesPerSide)); // index along z-axis

        targetPositionX = (ix * cubeSize) / particlesPerSide - cubeSize / 2;
        targetPositionY = (iy * cubeSize) / particlesPerSide - cubeSize / 2;
        targetPositionZ =
          (5 * (iz * cubeSize)) / particlesPerSide - cubeSize / 2;
        break;
      case "bigCube":
        cubeSize = geometricObjectSize * 12; // size of the cube
        particlesPerSide = Math.cbrt(numParticles); // number of particles per side of the cube

        ix = i % particlesPerSide; // index along x-axis
        iy = Math.floor((i / particlesPerSide) % particlesPerSide); // index along y-axis
        iz = Math.floor(i / (particlesPerSide * particlesPerSide)); // index along z-axis

        targetPositionX = (ix * cubeSize) / particlesPerSide - cubeSize / 2;
        targetPositionY = (iy * cubeSize) / particlesPerSide - cubeSize / 2;
        targetPositionZ = (iz * cubeSize) / particlesPerSide - cubeSize / 2;
        break;
      default:
        console.log("Not a known shape");
        break;
    }

    targetPositions.push({
      x: targetPositionX + sceneFocusX,
      y: targetPositionY + sceneFocusY,
      z: targetPositionZ + sceneFocusZ,
    });
  }
  // let aDuration, RotateX, RotateY;
  // if (!explode) {
  //   aDuration = 4.5;
  //   RotateX = 4;
  //   RotateY = 2;
  // } else {
  //   aDuration = 1.5;
  //   RotateX = 2;
  //   RotateY = 0;
  // }
}

type ParticulesComponentProps = {
  scrollRef0: RefObject<HTMLDivElement>;
  scrollRef1: RefObject<HTMLDivElement>;
  scrollRef2: RefObject<HTMLDivElement>;
  scrollRef3: RefObject<HTMLDivElement>;
  scrollRef4: RefObject<HTMLDivElement>;
};

export default function Particules({
  scrollRef0,
  scrollRef1,
  scrollRef2,
  scrollRef3,
  scrollRef4,
}: ParticulesComponentProps) {
  useEffect(() => {
    if (typeof window !== "undefined") {
      init();
      calculateTargetPositions();
      animate();
    }

    const onScroll = () => {
      const offset = window.innerHeight / 2;
      const yPositions = [
        0,
        scrollRef0.current?.offsetTop || 0,
        scrollRef1.current?.offsetTop || 0,
        scrollRef2.current?.offsetTop || 0,
        scrollRef3.current?.offsetTop || 0,
        scrollRef4.current?.offsetTop || 0,
      ];

      const scrollPosition =
        window.scrollY || document.documentElement.scrollTop;

      for (let i = 0; i < totalShapes; i++) {
        if (
          scrollPosition + offset >= yPositions[i] &&
          (i === totalShapes - 1 || scrollPosition + offset < yPositions[i + 1])
        ) {
          if (currentShape !== i) {
            currentShape = i;
            speed = shapes[currentShape].speed;
            console.log(speed);
            calculateTargetPositions();
          }
          break;
        }
      }
    };

    window.addEventListener("keydown", onKeydown, false);
    window.addEventListener("resize", onWindowResize, false);
    if (hasScrollBehavior) {
      window.addEventListener("scroll", onScroll, false);
    }

    return () => {
      window.removeEventListener("keydown", onKeydown, false);
      window.removeEventListener("resize", onWindowResize, false);
      //window.removeEventListener("scroll", onScroll, false);
      renderer.dispose();
    };
  }, [scrollRef0, scrollRef1, scrollRef2, scrollRef3, scrollRef4]);

  return (
    <div id="canvas-container">
      {/* Canvas will be appended here by Three.js */}
    </div>
  );
}
