import Lottie, { LottieRefCurrentProps } from "lottie-react";
import React, { useEffect, useRef } from "react";

import collapseBar from "@sparkle/lottie/collapseBar";

// Custom color definitions
const customColors = {
  gray: {
    200: "#D3D5D9",
    800: "#2A3241",
  },
};

export interface CollapseButtonProps {
  direction: "left" | "right";
  variant?: "light" | "dark";
}

type LottieColorType = [number, number, number, number];

// Convert hex to RGB array [r, g, b, a]
const hexToRgba = (hex: string): LottieColorType => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b, 1];
};

const colors: Record<
  NonNullable<CollapseButtonProps["variant"]>,
  LottieColorType
> = {
  light: hexToRgba(customColors.gray[200]),
  dark: hexToRgba(customColors.gray[800]),
};

// Helper to check if array is a color array
const isColorArray = (arr: unknown): arr is LottieColorType => {
  return (
    Array.isArray(arr) &&
    arr.length === 4 &&
    arr.every((n) => typeof n === "number")
  );
};

interface LottieObject {
  [key: string]: LottieInput;
}

type LottieInput =
  | number
  | string
  | boolean
  | LottieColorType
  | LottieObject
  | LottieInput[];

// Replace colors in Lottie animation
const replaceColors = (
  obj: LottieInput,
  newColor: LottieColorType
): LottieInput => {
  if (Array.isArray(obj)) {
    return obj.map((item) => replaceColors(item, newColor));
  } else if (obj !== null && typeof obj === "object") {
    for (const key in obj) {
      if (isColorArray(obj[key])) {
        obj[key] = newColor;
      } else {
        obj[key] = replaceColors(obj[key], newColor);
      }
    }
  }
  return obj;
};

// Constant to store frame numbers
const FRAMES = {
  INITIAL: 0,
  IDLE: 13,
  LEFT_START: 1,
  RIGHT_END: 25,
};

const CollapseButton: React.FC<CollapseButtonProps> = ({
  direction,
  variant = "light",
}) => {
  const lottieRef = useRef<LottieRefCurrentProps | null>(null);

  // Function to handle hover event
  const handleMouseEnter = () => {
    if (lottieRef.current?.animationItem) {
      if (direction === "left") {
        lottieRef.current.animationItem.playSegments(
          [FRAMES.IDLE, FRAMES.LEFT_START],
          true
        );
      } else if (direction === "right") {
        lottieRef.current.animationItem.playSegments(
          [FRAMES.IDLE, FRAMES.RIGHT_END],
          true
        );
      }
    }
  };

  // Function to reset animation to idle state
  const handleMouseLeave = () => {
    if (lottieRef.current?.animationItem) {
      if (direction === "left") {
        lottieRef.current.animationItem.playSegments(
          [FRAMES.LEFT_START, FRAMES.IDLE],
          true
        );
      } else if (direction === "right") {
        lottieRef.current.animationItem.playSegments(
          [FRAMES.RIGHT_END, FRAMES.IDLE],
          true
        );
      }
    }
  };

  useEffect(() => {
    // Ensure the animation starts from the initial state
    const initializeAnimation = () => {
      if (lottieRef.current?.animationItem) {
        lottieRef.current.animationItem.goToAndStop(FRAMES.INITIAL, true);
        // Set to idle state after initial load
        setTimeout(() => {
          lottieRef.current?.animationItem?.goToAndStop(FRAMES.IDLE, true);
        }, 100);
      }
    };

    // Adding a small delay to ensure the animation is ready
    const timeoutId = setTimeout(initializeAnimation, 100);

    return () => clearTimeout(timeoutId);
  }, [direction]);

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ width: `24px`, height: `30px` }}
      className="s-cursor-pointer"
    >
      <Lottie
        lottieRef={lottieRef}
        animationData={replaceColors(
          JSON.parse(JSON.stringify(collapseBar)),
          colors[variant]
        )}
        loop={false}
        autoplay={false}
      />
    </div>
  );
};

export default CollapseButton;
