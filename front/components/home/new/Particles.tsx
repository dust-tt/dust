import { useEffect } from "react";
import * as THREE from "three";

let speed = 0.08;
// const postExplodeSpeed = 0.03;
const postExplodeSpeed = 0.03;
const particleSize = 0.008; // Size of the particles
let targetSize = particleSize; // initial target size

export const particuleShapes = [
  { name: "grid", opacity: 1, size: particleSize },
  { name: "wave", opacity: 1, size: particleSize },
  { name: "bigSphere", opacity: 1, size: particleSize },
  { name: "sphere", opacity: 1, size: particleSize },
  { name: "cube", opacity: 1, size: particleSize },
  { name: "bigCube", opacity: 1, size: particleSize },
  { name: "torus", opacity: 1, size: particleSize },
  { name: "pyramid", opacity: 1, size: particleSize },
  { name: "octahedron", opacity: 1, size: particleSize },
  { name: "tetrahedron", opacity: 1, size: particleSize },
  { name: "icosahedron", opacity: 1, size: particleSize },
];

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
const geometricObjectSize = 1.25;
const rotationActive = true; // Activate the rotation of the scene

// Center of the animation
const sceneFocusX = 0;
const sceneFocusY = 0;
const sceneFocusZ = 0;
let targetPositions: { x: number; y: number; z: number }[] = []; // Array to hold the target positions of all particles for each shape

function handleContextLost(event: Event) {
  event.preventDefault();
  renderer.domElement.style.display = "none";
}

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

  // Add WebGL context lost event listener
  renderer.domElement.addEventListener(
    "webglcontextlost",
    handleContextLost,
    false
  );

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
  particleSystem.rotation.x = -1.2;
  particleSystem.rotation.y = 0;
  particleSystem.rotation.z = 0;
  scene.add(particleSystem);
}

function onWindowResize() {
  // Update camera aspect ratio
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  // Update renderer size
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  // Get the current size
  const currentSize = (particleSystem.material as THREE.PointsMaterial).size;

  // Calculate the difference between the current size and the target size
  const sizeDifference = targetSize - currentSize;

  // If the difference is too small, directly set to targetSize to avoid endless tiny oscillations
  if (Math.abs(sizeDifference) < 0.001) {
    (particleSystem.material as THREE.PointsMaterial).size = targetSize;
  } else {
    // Gradually change the size
    (particleSystem.material as THREE.PointsMaterial).size +=
      sizeDifference * 0.01; // 0.01 is the speed of size change, adjust this value to your need
  }

  requestAnimationFrame(animate);
  if (rotationActive) {
    particleSystem.rotation.x += 0.0;
    particleSystem.rotation.y += 0.0;
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

function calculateTargetPositions(currentShape = 0) {
  targetPositions = []; // Reset the target positions
  targetSize = particuleShapes[currentShape].size;

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
      phi: number,
      theta,
      radius,
      particlesPerSide,
      vertices,
      vertex1,
      vertex2,
      faceIndex,
      faceVertexIndex,
      lerpFactor,
      faceIndices,
      cubeSize,
      gridSize = 16;

    const gridNum = 48;
    switch (particuleShapes[currentShape].name) {
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
        gridSize = 8;
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
        cubeSize = geometricObjectSize * 2.5;
        const cubeSegments = Math.ceil(Math.cbrt(numParticles / 2));

        const cubeFace = Math.floor(i / (cubeSegments * cubeSegments));
        ix = i % cubeSegments;
        iy = Math.floor(i / cubeSegments) % cubeSegments;

        switch (cubeFace) {
          case 0: // Front
            targetPositionX =
              (ix / (cubeSegments - 1)) * cubeSize - cubeSize / 2;
            targetPositionY =
              (iy / (cubeSegments - 1)) * cubeSize - cubeSize / 2;
            targetPositionZ = cubeSize / 2;
            break;
          case 1: // Back
            targetPositionX =
              (ix / (cubeSegments - 1)) * cubeSize - cubeSize / 2;
            targetPositionY =
              (iy / (cubeSegments - 1)) * cubeSize - cubeSize / 2;
            targetPositionZ = -cubeSize / 2;
            break;
          case 2: // Left
            targetPositionX = -cubeSize / 2;
            targetPositionY =
              (iy / (cubeSegments - 1)) * cubeSize - cubeSize / 2;
            targetPositionZ =
              (ix / (cubeSegments - 1)) * cubeSize - cubeSize / 2;
            break;
          case 3: // Right
            targetPositionX = cubeSize / 2;
            targetPositionY =
              (iy / (cubeSegments - 1)) * cubeSize - cubeSize / 2;
            targetPositionZ =
              (ix / (cubeSegments - 1)) * cubeSize - cubeSize / 2;
            break;
          case 4: // Top
            targetPositionX =
              (ix / (cubeSegments - 1)) * cubeSize - cubeSize / 2;
            targetPositionY = cubeSize / 2;
            targetPositionZ =
              (iy / (cubeSegments - 1)) * cubeSize - cubeSize / 2;
            break;
          case 5: // Bottom
            targetPositionX =
              (ix / (cubeSegments - 1)) * cubeSize - cubeSize / 2;
            targetPositionY = -cubeSize / 2;
            targetPositionZ =
              (iy / (cubeSegments - 1)) * cubeSize - cubeSize / 2;
            break;
        }
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
      case "torus":
        const torusRadius = geometricObjectSize * 1.5; // distance from the center of the torus to the center of the tube
        const tubeRadius = geometricObjectSize * 0.8; // radius of the tube
        const torusSegments = 140; // number of segments for the torus
        const tubeSegments = 60; // number of segments for the tube

        const torusAngle =
          ((i % torusSegments) * (Math.PI * 2)) / torusSegments;
        const tubeAngle =
          (Math.floor(i / torusSegments) * (Math.PI * 2)) / tubeSegments;

        targetPositionX =
          (torusRadius + tubeRadius * Math.cos(tubeAngle)) *
          Math.cos(torusAngle);
        targetPositionY =
          (torusRadius + tubeRadius * Math.cos(tubeAngle)) *
          Math.sin(torusAngle);
        targetPositionZ = tubeRadius * Math.sin(tubeAngle);
        break;

      case "pyramid":
        const pyramidSize = geometricObjectSize * 3;
        const pyramidSegments = Math.floor(Math.sqrt(numParticles / 3));

        ix = i % pyramidSegments;
        iy = Math.floor(i / pyramidSegments) % pyramidSegments;

        const xPos =
          (ix / (pyramidSegments - 1)) * pyramidSize - pyramidSize / 2;
        const yPos =
          (iy / (pyramidSegments - 1)) * pyramidSize - pyramidSize / 2;
        const zPos =
          pyramidSize / 2 -
          (Math.max(ix, iy) / (pyramidSegments - 1)) * pyramidSize;

        targetPositionX = xPos;
        targetPositionY = yPos;
        targetPositionZ = zPos;
        break;

      case "octahedron":
        const octahedronRadius = geometricObjectSize * 1.5;
        const octahedronVertices = [
          [1, 0, 0],
          [-1, 0, 0],
          [0, 1, 0],
          [0, -1, 0],
          [0, 0, 1],
          [0, 0, -1],
        ];

        const octahedronFaces = [
          [0, 2, 4],
          [0, 4, 3],
          [0, 3, 5],
          [0, 5, 2],
          [1, 2, 5],
          [1, 5, 3],
          [1, 3, 4],
          [1, 4, 2],
        ];

        faceIndex = Math.floor(i / (numParticles / 8));
        const vertexIndex = Math.floor(
          (i % (numParticles / 8)) / (numParticles / 24)
        );
        vertex1 = octahedronVertices[octahedronFaces[faceIndex][vertexIndex]];
        vertex2 =
          octahedronVertices[octahedronFaces[faceIndex][(vertexIndex + 1) % 3]];

        lerpFactor = (i % (numParticles / 24)) / (numParticles / 24);
        targetPositionX =
          octahedronRadius *
          (vertex1[0] + (vertex2[0] - vertex1[0]) * lerpFactor);
        targetPositionY =
          octahedronRadius *
          (vertex1[1] + (vertex2[1] - vertex1[1]) * lerpFactor);
        targetPositionZ =
          octahedronRadius *
          (vertex1[2] + (vertex2[2] - vertex1[2]) * lerpFactor);
        break;

      case "tetrahedron":
        const tetrahedronRadius = geometricObjectSize * 1.5;

        phi = Math.acos(-1 + (2 * i) / numParticles);
        theta = Math.sqrt(numParticles * Math.PI) * phi;

        targetPositionX =
          tetrahedronRadius *
          (Math.sin(phi) * Math.cos(theta) +
            (Math.sqrt(3) * Math.cos(phi)) / 3);
        targetPositionY =
          tetrahedronRadius *
          (Math.sin(phi) * Math.sin(theta) -
            (Math.sqrt(3) * Math.cos(phi)) / 3);
        targetPositionZ =
          tetrahedronRadius * ((-2 * Math.sqrt(3) * Math.sin(phi)) / 3);
        break;

      case "icosahedron":
        const icosahedronRadius = geometricObjectSize * 1.5;
        phi = (1 + Math.sqrt(5)) / 2; // Golden ratio

        vertices = [
          [-1, phi, 0],
          [1, phi, 0],
          [-1, -phi, 0],
          [1, -phi, 0],
          [0, -1, phi],
          [0, 1, phi],
          [0, -1, -phi],
          [0, 1, -phi],
          [phi, 0, -1],
          [phi, 0, 1],
          [-phi, 0, -1],
          [-phi, 0, 1],
        ];

        for (let i = 0; i < vertices.length; i++) {
          vertices[i] = vertices[i].map(
            (x) => (x * icosahedronRadius) / Math.sqrt(1 + phi * phi)
          );
        }

        faceIndices = [
          [0, 11, 5],
          [0, 5, 1],
          [0, 1, 7],
          [0, 7, 10],
          [0, 10, 11],
          [1, 5, 9],
          [5, 11, 4],
          [11, 10, 2],
          [10, 7, 6],
          [7, 1, 8],
          [3, 9, 4],
          [3, 4, 2],
          [3, 2, 6],
          [3, 6, 8],
          [3, 8, 9],
          [4, 9, 5],
          [2, 4, 11],
          [6, 2, 10],
          [8, 6, 7],
          [9, 8, 1],
        ];

        faceIndex = Math.floor(i / (numParticles / 20));
        faceVertexIndex = Math.floor(
          (i % (numParticles / 20)) / (numParticles / 60)
        );
        vertex1 = vertices[faceIndices[faceIndex][faceVertexIndex]];
        vertex2 = vertices[faceIndices[faceIndex][(faceVertexIndex + 1) % 3]];

        lerpFactor = (i % (numParticles / 60)) / (numParticles / 60);
        targetPositionX = vertex1[0] + (vertex2[0] - vertex1[0]) * lerpFactor;
        targetPositionY = vertex1[1] + (vertex2[1] - vertex1[1]) * lerpFactor;
        targetPositionZ = vertex1[2] + (vertex2[2] - vertex1[2]) * lerpFactor;
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
}

interface ParticulesProps {
  currentShape: number;
}

export default function Particules({ currentShape }: ParticulesProps) {
  useEffect(() => {
    if (typeof window !== "undefined") {
      init();
      calculateTargetPositions();
      animate();
    }

    window.addEventListener("resize", onWindowResize, false);

    return () => {
      window.removeEventListener("resize", onWindowResize, false);
      renderer.domElement.removeEventListener(
        "webglcontextlost",
        handleContextLost
      );
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    calculateTargetPositions(currentShape);
  }, [currentShape]);

  return (
    <div id="canvas-container">
      {/* Canvas will be appended here by Three.js */}
    </div>
  );
}
