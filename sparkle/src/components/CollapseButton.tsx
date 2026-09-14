import collapseBar from "@sparkle/lottie/collapseBar";
import Lottie, { type LottieRefCurrentProps } from "lottie-react";
import React, { useEffect, useMemo, useRef } from "react";

// Custom color definitions
const customColors = {
  gray: {
    200: "#D3D5D9",
    800: "#2A3241",
  },
};

export interface CollapseButtonProps {
  /** Direction the chevron points on hover: `left` to collapse a left rail, `right` to expand it. */
  direction: "left" | "right";
  /** Color treatment matching the surface contrast: `light` or `dark`. */
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

/**
 * An animated chevron affordance for collapsing or expanding a side panel, playing
 * a Lottie animation on hover that points in the `direction` it controls. Use it as
 * the toggle handle for a collapsible sidebar or rail; it renders only the icon, so
 * wrap it in a tooltip or an accessible control if it needs a label.
 * @summary Panel-collapse chevron handle.
 */
const CollapseButton: React.FC<CollapseButtonProps> = ({
  direction,
  variant = "light",
}) => {
  const lottieRef = useRef<LottieRefCurrentProps | null>(null);
  const animationData = useMemo(
    () =>
      replaceColors(JSON.parse(JSON.stringify(collapseBar)), colors[variant]),
    [variant]
  );

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
  }, []);

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ width: `24px`, height: `30px` }}
      className="cursor-pointer"
    >
      <Lottie
        lottieRef={lottieRef}
        animationData={animationData}
        loop={false}
        autoplay={false}
      />
    </div>
  );
};

export { CollapseButton };
