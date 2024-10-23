import Lottie from "lottie-react";
import React from "react";

import animColor from "@sparkle/lottie/spinnerColor";
import animColorLG from "@sparkle/lottie/spinnerColorLG";
import animColorXS from "@sparkle/lottie/spinnerColorXS";
import animDark from "@sparkle/lottie/spinnerDark";
import animDarkLG from "@sparkle/lottie/spinnerDarkLG";
import animDarkXS from "@sparkle/lottie/spinnerDarkXS";
import animLightXS from "@sparkle/lottie/spinnerLight";
import animLightLG from "@sparkle/lottie/spinnerLightLG";
import animSimpleLight from "@sparkle/lottie/spinnerLightXS";

export interface SpinnerProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "xxl";
  variant?: "color" | "light" | "dark" | "pink900" | "purple900" | "slate400";
}

const pxSizeClasses = {
  xs: "16",
  sm: "20",
  md: "24",
  lg: "32",
  xl: "128",
  xxl: "192",
};

type LottieColorType = [number, number, number, number];

const colors: { [key: string]: LottieColorType } = {
  emerald900: [0.0235, 0.3059, 0.2314, 1], // #064E3B
  amber900: [0.5725, 0.251, 0.0549, 1], // #92400E
  slate900: [0.0588, 0.0902, 0.1647, 1], // #0F172A
  purple900: [0.298, 0.1137, 0.5843, 1], // #4C1D95
  sky900: [0.0471, 0.2902, 0.4314, 1], // #0C4A6E
  slate400: [0.5804, 0.6392, 0.7216, 1], // #94A3B8
  pink900: [0.5137, 0.0941, 0.2627, 1], // #831843
  red900: [0.498, 0.1137, 0.1137, 1], // #7F1D1D
  warning900: [0.498, 0.1137, 0.1137, 1], // #7F1D1D
  action900: [0.1176, 0.2275, 0.5412, 1], // #1E3A8A
};

const isColorArray = (arr: unknown): arr is LottieColorType => {
  return (
    Array.isArray(arr) &&
    arr.length === 4 &&
    arr.every((n) => typeof n === "number")
  );
};

// Due to the dynamic nature of Lottie, we use 'any' for the input object.
// This function recursively replaces color arrays within the Lottie animation object.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const replaceColors = (obj: any, newColor: LottieColorType): any => {
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

const Spinner: React.FC<SpinnerProps> = ({
  size = "md",
  variant = "color",
}) => {
  const fullSize = parseInt(pxSizeClasses[size], 10);

  let anim;

  switch (size) {
    case "xs":
      switch (variant) {
        case "light":
          anim = animSimpleLight;
          break;

        case "dark":
          anim = animDarkXS;
          break;

        default:
          anim = animColorXS;
      }
      break;

    case "xl":
    case "xxl":
      switch (variant) {
        case "light":
          anim = animLightLG;
          break;

        case "dark":
          anim = animDarkLG;
          break;

        default:
          anim = animColorLG;
      }
      break;

    default:
      switch (variant) {
        case "light":
          anim = animLightXS;
          break;

        case "dark":
          anim = animDark;
          break;

        default:
          anim = animColor;
      }
  }

  if (variant && variant in colors) {
    // Clone the animation data to modify it
    const animationData = JSON.parse(JSON.stringify(anim));
    const newColor = colors[variant];

    if (newColor) {
      replaceColors(animationData, newColor);
    }

    return (
      <Lottie
        animationData={animationData}
        style={{ width: `${fullSize}px`, height: `${fullSize}px` }}
        loop
        autoplay
      />
    );
  }

  return (
    <Lottie
      animationData={anim}
      style={{ width: `${fullSize}px`, height: `${fullSize}px` }}
      loop
      autoplay
    />
  );
};

export default Spinner;
