import { useEffect } from "react";
import * as THREE from "three";

let speed = 0.08;
const postExplodeSpeed = 0.03;
const particleSize = 0.008; // Size of the particles
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let particleSystem: THREE.Points;
const backgroundColor = 0xffffff;
const colorsArray = [0xb2b6bd, 0xd3d5d9, 0xeeeeef, 0x969ca5, 0xffffff];

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

export const shapeNames = {
  grid: "grid",
  wave: "wave",
  bigSphere: "bigSphere",
  cube: "cube",
  bigCube: "bigCube",
  torus: "torus",
  sphere: "sphere",
  pyramid: "pyramid",
  octahedron: "octahedron",
  cone: "cone",
  icosahedron: "icosahedron",
  galaxy: "galaxy",
};

const shapeNamesArray = Object.values(shapeNames).map((value) => ({
  name: value,
}));

export function getParticleShapeIndexByName(name: string) {
  return shapeNamesArray.findIndex((shape) => shape.name === name);
}

interface ParticulesProps {
  currentShape: number;
}

function Particules({ currentShape }: ParticulesProps) {
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

function handleContextLost(event: Event) {
  event.preventDefault();
  renderer.domElement.style.display = "none";
}

function animate() {
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
  speed = postExplodeSpeed;
  targetPositions = []; // Reset the target positions
  for (let i = 0; i < numParticles; i++) {
    let targetPosition = { x: 0, y: 0, z: 0 }; // Initialize targetPosition with default values

    switch (shapeNamesArray[currentShape].name) {
      case "grid":
        targetPosition = calculateGridPosition(i);
        break;
      case "wave":
        targetPosition = calculateWavePosition(i);
        break;
      case "sphere":
        targetPosition = calculateSpherePosition(i, geometricObjectSize * 1.4);
        break;
      case "bigSphere":
        targetPosition = calculateSpherePosition(i, geometricObjectSize * 4);
        break;
      case "cube":
        targetPosition = calculateCubePosition(i, geometricObjectSize * 3.3);
        break;
      case "bigCube":
        targetPosition = calculateBigCubePosition(i, geometricObjectSize * 12);
        break;
      case "torus":
        targetPosition = calculateTorusPosition(
          i,
          geometricObjectSize * 1.5,
          geometricObjectSize * 0.8
        );
        break;
      case "pyramid":
        targetPosition = calculatePyramidPosition(i, geometricObjectSize * 2);
        break;
      case "octahedron":
        targetPosition = calculateOctahedronPosition(
          i,
          geometricObjectSize * 4
        );
        break;
      case "tetrahedron":
        targetPosition = calculateTetrahedronPosition(
          i,
          geometricObjectSize * 1.5
        );
        break;
      case "icosahedron":
        targetPosition = calculateIcosahedronPosition(
          i,
          geometricObjectSize * 1
        );
        break;
      case "cone":
        targetPosition = calculateConePosition(
          i,
          geometricObjectSize * 3,
          geometricObjectSize * 12
        );
        break;
      case "galaxy":
        targetPosition = calculateGalaxyPosition(i, geometricObjectSize * 0.2);
        break;
      default:
        console.log("Not a known shape");
        targetPosition = { x: 0, y: 0, z: 0 };
        break;
    }

    targetPositions.push({
      x: targetPosition.x + sceneFocusX,
      y: targetPosition.y + sceneFocusY,
      z: targetPosition.z + sceneFocusZ,
    });
  }
}

function calculateGridPosition(i: number) {
  const gridSize = 16;
  const gridNum = 48;
  const gridSpacing = gridSize / gridNum;
  const gridX = i % gridNum;
  const gridY = Math.floor(i / 3 / gridNum) % gridNum;
  const targetPositionX = gridX * gridSpacing - gridSize / 2 + gridSpacing / 2;
  const targetPositionY = gridY * gridSpacing - gridSize / 2 + gridSpacing / 2;
  const targetPositionZ = 0;
  return { x: targetPositionX, y: targetPositionY, z: targetPositionZ };
}

function calculateWavePosition(i: number) {
  const gridSize = 8;
  const gridNum = 48;
  const gridSpacing = gridSize / gridNum;
  const rippleAmplitude = 0.1;
  const rippleFrequency = (12 * Math.PI) / gridSize;
  const gridX = i % gridNum;
  const gridY = Math.floor(i / 3 / gridNum) % gridNum;
  const targetPositionX = gridX * gridSpacing - gridSize / 2 + gridSpacing / 2;
  const targetPositionY = gridY * gridSpacing - gridSize / 2 + gridSpacing / 2;
  const dx = targetPositionX;
  const dy = targetPositionY;
  const distanceFromCenter = Math.sqrt(dx * dx + dy * dy);
  const targetPositionZ =
    rippleAmplitude * Math.sin(rippleFrequency * distanceFromCenter);
  return { x: targetPositionX, y: targetPositionY, z: targetPositionZ };
}

function calculateSpherePosition(i: number, radius: number) {
  const phi = Math.acos(-1 + (2 * i) / numParticles);
  const theta = Math.sqrt(numParticles * Math.PI) * phi;
  const targetPositionX = radius * Math.cos(theta) * Math.sin(phi);
  const targetPositionY = radius * Math.sin(theta) * Math.sin(phi);
  const targetPositionZ = radius * Math.cos(phi);
  return { x: targetPositionX, y: targetPositionY, z: targetPositionZ };
}

function calculateCubePosition(i: number, cubeSize: number) {
  const cubeSegments = Math.ceil(Math.cbrt(numParticles / 2));
  const cubeFace = Math.floor(i / (cubeSegments * cubeSegments));
  const ix = i % cubeSegments;
  const iy = Math.floor(i / cubeSegments) % cubeSegments;
  let targetPositionX = 0;
  let targetPositionY = 0;
  let targetPositionZ = 0;

  switch (cubeFace) {
    case 0: // Front
      targetPositionX = (ix / (cubeSegments - 1)) * cubeSize - cubeSize / 2;
      targetPositionY = (iy / (cubeSegments - 1)) * cubeSize - cubeSize / 2;
      targetPositionZ = cubeSize / 2;
      break;
    case 1: // Back
      targetPositionX = (ix / (cubeSegments - 1)) * cubeSize - cubeSize / 2;
      targetPositionY = (iy / (cubeSegments - 1)) * cubeSize - cubeSize / 2;
      targetPositionZ = -cubeSize / 2;
      break;
    case 2: // Left
      targetPositionX = -cubeSize / 2;
      targetPositionY = (iy / (cubeSegments - 1)) * cubeSize - cubeSize / 2;
      targetPositionZ = (ix / (cubeSegments - 1)) * cubeSize - cubeSize / 2;
      break;
    case 3: // Right
      targetPositionX = cubeSize / 2;
      targetPositionY = (iy / (cubeSegments - 1)) * cubeSize - cubeSize / 2;
      targetPositionZ = (ix / (cubeSegments - 1)) * cubeSize - cubeSize / 2;
      break;
    case 4: // Top
      targetPositionX = (ix / (cubeSegments - 1)) * cubeSize - cubeSize / 2;
      targetPositionY = cubeSize / 2;
      targetPositionZ = (iy / (cubeSegments - 1)) * cubeSize - cubeSize / 2;
      break;
    case 5: // Bottom
      targetPositionX = (ix / (cubeSegments - 1)) * cubeSize - cubeSize / 2;
      targetPositionY = -cubeSize / 2;
      targetPositionZ = (iy / (cubeSegments - 1)) * cubeSize - cubeSize / 2;
      break;
  }

  return { x: targetPositionX, y: targetPositionY, z: targetPositionZ };
}

function calculateBigCubePosition(i: number, cubeSize: number) {
  const particlesPerSide = Math.cbrt(numParticles);
  const ix = i % particlesPerSide;
  const iy = Math.floor((i / particlesPerSide) % particlesPerSide);
  const iz = Math.floor(i / (particlesPerSide * particlesPerSide));
  const targetPositionX = (ix * cubeSize) / particlesPerSide - cubeSize / 2;
  const targetPositionY = (iy * cubeSize) / particlesPerSide - cubeSize / 2;
  const targetPositionZ = (iz * cubeSize) / particlesPerSide - cubeSize / 2;
  return { x: targetPositionX, y: targetPositionY, z: targetPositionZ };
}

function calculateTorusPosition(
  i: number,
  torusRadius: number,
  tubeRadius: number
) {
  const torusSegments = 140;
  const tubeSegments = 60;
  const torusAngle = ((i % torusSegments) * (Math.PI * 2)) / torusSegments;
  const tubeAngle =
    (Math.floor(i / torusSegments) * (Math.PI * 2)) / tubeSegments;
  const targetPositionX =
    (torusRadius + tubeRadius * Math.cos(tubeAngle)) * Math.cos(torusAngle);
  const targetPositionY =
    (torusRadius + tubeRadius * Math.cos(tubeAngle)) * Math.sin(torusAngle);
  const targetPositionZ = tubeRadius * Math.sin(tubeAngle);
  return { x: targetPositionX, y: targetPositionY, z: targetPositionZ };
}

function calculatePyramidPosition(i: number, pyramidSize: number) {
  const vertices = [
    [-1, -1, -1],
    [1, -1, -1],
    [1, -1, 1],
    [-1, -1, 1],
    [0, 1, 0],
  ];

  const faces = [
    [0, 1, 4],
    [1, 2, 4],
    [2, 3, 4],
    [3, 0, 4],
    [0, 3, 2, 1],
  ];

  const faceIndex = Math.floor(i / (numParticles / faces.length));
  const face = faces[faceIndex];

  const numVerticesInFace = face.length;
  const r = Math.random();
  const s = Math.random();

  let u = 0;
  let v = 0;
  let w = 0;

  if (numVerticesInFace === 3) {
    const power = 2;
    u = 1 - Math.pow(r, power);
    v = Math.pow(r, power) * (1 - Math.pow(s, power));
    w = Math.pow(r, power) * Math.pow(s, power);
  } else {
    const power = 2;
    const sqrt_r = Math.sqrt(r);
    u = 1 - Math.pow(sqrt_r, power);
    v = Math.pow(sqrt_r, power) * (1 - Math.pow(s, power));
    w = Math.pow(sqrt_r, power) * Math.pow(s, power);
  }

  const v1 = vertices[face[0]];
  const v2 = vertices[face[1]];
  const v3 = vertices[face[2]];
  const v4 = numVerticesInFace === 4 ? vertices[face[3]] : [0, 0, 0];

  const x =
    (u * v1[0] + v * v2[0] + w * v3[0] + (1 - u - v - w) * v4[0]) * pyramidSize;
  let y =
    (u * v1[1] + v * v2[1] + w * v3[1] + (1 - u - v - w) * v4[1]) * pyramidSize;
  let z =
    (u * v1[2] + v * v2[2] + w * v3[2] + (1 - u - v - w) * v4[2]) * pyramidSize;

  // Rotate 90 degrees around the x-axis
  const tempY = y;
  y = -z;
  z = tempY;

  return { x, y, z };
}

function calculateConePosition(i: number, radius: number, height: number) {
  const segments = Math.ceil(Math.sqrt(numParticles));
  const angleStep = (2 * Math.PI) / segments;

  const segment = Math.floor(i / segments);
  const segmentOffset = i % segments;

  const angle = segmentOffset * angleStep;
  const distanceFromCenter = (radius * (segments - segment)) / segments;

  const x = distanceFromCenter * Math.cos(angle);
  const y = height * (segment / segments) - height / 2;
  const z = distanceFromCenter * Math.sin(angle);

  return { x, y, z };
}

function calculateOctahedronPosition(i: number, octahedronSize: number) {
  const vertices = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];

  const faces = [
    [0, 2, 4],
    [0, 4, 3],
    [0, 3, 5],
    [0, 5, 2],
    [1, 4, 2],
    [1, 3, 4],
    [1, 5, 3],
    [1, 2, 5],
  ];

  const faceIndex = Math.floor(i / (numParticles / faces.length));
  const face = faces[faceIndex];

  const r1 = Math.random();
  const r2 = Math.random();

  const power = 2; // Adjust this value to control the accumulation around the edges
  const u = 1 - Math.pow(r1, power);
  const v = Math.pow(r1, power) * (1 - Math.pow(r2, power));
  const w = Math.pow(r1, power) * Math.pow(r2, power);

  const v1 = vertices[face[0]];
  const v2 = vertices[face[1]];
  const v3 = vertices[face[2]];

  const targetPositionX = (u * v1[0] + v * v2[0] + w * v3[0]) * octahedronSize;
  const targetPositionY = (u * v1[1] + v * v2[1] + w * v3[1]) * octahedronSize;
  const targetPositionZ = (u * v1[2] + v * v2[2] + w * v3[2]) * octahedronSize;
  return { x: targetPositionX, y: targetPositionY, z: targetPositionZ };
}

function calculateTetrahedronPosition(i: number, tetrahedronRadius: number) {
  const phi = Math.acos(-1 + (2 * i) / numParticles);
  const theta = Math.sqrt(numParticles * Math.PI) * phi;
  const targetPositionX =
    tetrahedronRadius *
    (Math.sin(phi) * Math.cos(theta) + (Math.sqrt(3) * Math.cos(phi)) / 3);
  const targetPositionY =
    tetrahedronRadius *
    (Math.sin(phi) * Math.sin(theta) - (Math.sqrt(3) * Math.cos(phi)) / 3);
  const targetPositionZ =
    tetrahedronRadius * ((-2 * Math.sqrt(3) * Math.sin(phi)) / 3);
  return { x: targetPositionX, y: targetPositionY, z: targetPositionZ };
}

function calculateIcosahedronPosition(i: number, icosahedronSize: number) {
  const t = (1 + Math.sqrt(5)) / 2;

  const vertices = [
    [-1, t, 0],
    [1, t, 0],
    [-1, -t, 0],
    [1, -t, 0],
    [0, -1, t],
    [0, 1, t],
    [0, -1, -t],
    [0, 1, -t],
    [t, 0, -1],
    [t, 0, 1],
    [-t, 0, -1],
    [-t, 0, 1],
  ];

  const faces = [
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

  const faceIndex = Math.floor(i / (numParticles / faces.length));
  const face = faces[faceIndex];

  const v1 = vertices[face[0]];
  const v2 = vertices[face[1]];
  const v3 = vertices[face[2]];

  const r1 = Math.random();
  const r2 = Math.random();
  const sqrt_r1 = Math.sqrt(r1);

  const power = 2; // Adjust this value to control the accumulation around the edges
  const u = 1 - Math.pow(sqrt_r1, power);
  const v = Math.pow(sqrt_r1, power) * (1 - Math.pow(r2, power));
  const w = Math.pow(sqrt_r1, power) * Math.pow(r2, power);

  const targetPositionX = (u * v1[0] + v * v2[0] + w * v3[0]) * icosahedronSize;
  const targetPositionY = (u * v1[1] + v * v2[1] + w * v3[1]) * icosahedronSize;
  const targetPositionZ = (u * v1[2] + v * v2[2] + w * v3[2]) * icosahedronSize;
  return { x: targetPositionX, y: targetPositionY, z: targetPositionZ };
}

function calculateGalaxyPosition(i: number, radius: number) {
  const numArms = 4;
  const armAngleOffset = (Math.PI * 2) / numArms;
  const armPoints = 100;
  const armSpread = 0.2;
  const armIndex = i % numArms;
  const armAngle = armIndex * armAngleOffset;
  const armPointIndex = Math.floor(i / numArms);
  const t = armPointIndex / armPoints;

  const angle = -(t * Math.PI) / 10 + armAngle;
  const distance = t * radius;

  const armOffsetX = (Math.random() - 0.5) * distance * armSpread;
  const armOffsetY = (Math.random() - 0.5) * distance * armSpread;
  const armOffsetZ = (Math.random() - 0.5) * distance * armSpread;

  const targetPositionX = Math.cos(angle) * distance + armOffsetX;
  const targetPositionY = Math.sin(angle) * distance + armOffsetY;
  const targetPositionZ = armOffsetZ;

  return { x: targetPositionX, y: targetPositionY, z: targetPositionZ };
}
