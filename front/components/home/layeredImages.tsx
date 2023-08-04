import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { gsap } from "gsap";

type LayeredImagesProps = {
  imagePaths: string[];
  imageScale: number;
  zMax: number;
};

const LayeredImages: React.FC<LayeredImagesProps> = ({
  imagePaths,
  imageScale = 1,
  zMax = 1,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    // Remove any existing canvases from the container
    while (containerRef.current.firstChild) {
      containerRef.current.firstChild.remove();
    }

    // Initialize Three.js objects here
    const scene = new THREE.Scene();
    const rotationAmp = 0.2;
    const groupRotation = { x: 0, y: 0 };

    const camera = new THREE.PerspectiveCamera(
      75, // This will be updated once we know the aspect ratio of the largest image
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(
      containerRef.current.clientWidth,
      containerRef.current.clientHeight
    );
    containerRef.current.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    const loader = new THREE.TextureLoader();
    const meshes = Array(imagePaths.length);

    let maxAspectRatio = 0; // We'll keep track of the max aspect ratio here

    const imagePromises = imagePaths.map((imagePath, index) => {
      return new Promise<void>((resolve) => {
        loader.load(imagePath, function (texture) {
          texture.magFilter = THREE.LinearFilter;
          texture.minFilter = THREE.LinearMipMapLinearFilter;
          texture.encoding = THREE.sRGBEncoding;

          const aspectRatio = texture.image.width / texture.image.height;
          maxAspectRatio = Math.max(maxAspectRatio, aspectRatio); // Update the max aspect ratio
          const geometry = new THREE.PlaneGeometry(2 * aspectRatio, 2);

          const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
          });

          meshes[index] = new THREE.Mesh(geometry, material);
          meshes[index].position.z = (index / (imagePaths.length - 1)) * 0.1; // Map the Z depth between 0 and 0.1
          group.add(meshes[index]);

          resolve();
        });
      });
    });

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onMouseMove = (event: MouseEvent) => {
      mouse.x =
        ((event.clientX - renderer.domElement.getBoundingClientRect().left) /
          renderer.domElement.clientWidth) *
          2 -
        1;
      mouse.y =
        -(
          (event.clientY - renderer.domElement.getBoundingClientRect().top) /
          renderer.domElement.clientHeight
        ) *
          2 +
        1;

      raycaster.setFromCamera(mouse, camera);

      const intersects = raycaster.intersectObjects(group.children, true);

      // Now the animation will be triggered whenever the mouse is anywhere on the canvas
      meshes.forEach((mesh, index) => {
        gsap.to(mesh.position, {
          z: -0.2 + (index / (imagePaths.length - 1)) * zMax, // Map the Z depth between -0.2 and zMax
          duration: 1,
          ease: "power2.out",
        });
      });

      gsap.to(groupRotation, {
        x:
          rotationAmp -
          (event.clientY / window.innerHeight) * Math.PI * (rotationAmp / 2),
        y: (event.clientX / window.innerWidth) * Math.PI * (-rotationAmp / 2),
        onUpdate: function () {
          group.rotation.x = groupRotation.x;
          group.rotation.y = groupRotation.y;
        },
        duration: 1,
        ease: "power2.out",
      });
    };

    const onMouseLeave = () => {
      // When the mouse leaves the canvas, animate the layers back to their original position
      meshes.forEach((mesh, index) => {
        gsap.to(mesh.position, {
          z: (index / (imagePaths.length - 1)) * 0.1, // Map the Z depth back between 0 and 0.1
          duration: 1,
          ease: "power2.out",
        });
      });

      gsap.to(groupRotation, {
        x: 0,
        y: 0,
        onUpdate: function () {
          group.rotation.x = groupRotation.x;
          group.rotation.y = groupRotation.y;
        },
        duration: 1,
        ease: "power2.out",
      });
    };

    renderer.domElement.addEventListener("mousemove", onMouseMove);
    renderer.domElement.addEventListener("mouseleave", onMouseLeave);

    Promise.all(imagePromises).then(() => {
      // Update the camera's field of view to make the images take up the specified percentage of the size of the canvas
      camera.fov =
        (2 * Math.atan(1 / (2 * maxAspectRatio)) * (180 / Math.PI)) /
        imageScale;
      camera.updateProjectionMatrix();

      camera.position.z = 5;

      const animate = () => {
        requestAnimationFrame(animate);
        renderer.render(scene, camera);
      };

      animate();
    });

    return () => {
      renderer.domElement.removeEventListener("mousemove", onMouseMove);
      renderer.domElement.removeEventListener("mouseleave", onMouseLeave);
    };
  }, [imagePaths, imageScale, zMax]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
};

export default LayeredImages;
