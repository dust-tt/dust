import Lottie from "lottie-react";
import React from "react";

import { customColors } from "@sparkle/lib/colors";
import animColor from "@sparkle/lottie/spinnerColor";
import animColorLG from "@sparkle/lottie/spinnerColorLG";
import animColorXS from "@sparkle/lottie/spinnerColorXS";
import animDark from "@sparkle/lottie/spinnerDark";
import animDarkLG from "@sparkle/lottie/spinnerDarkLG";
import animDarkXS from "@sparkle/lottie/spinnerDarkXS";
import animLightXS from "@sparkle/lottie/spinnerLight";
import animLightLG from "@sparkle/lottie/spinnerLightLG";
import animSimpleLight from "@sparkle/lottie/spinnerLightXS";

type SpinnerSizeType = (typeof SPINNER_SIZES)[number];
const SPINNER_SIZES = ["xs", "sm", "md", "lg", "xl", "xxl"] as const;

export interface SpinnerProps {
  size?: SpinnerSizeType;
  variant?: SpinnerVariantType;
}

// Generate all possible color-shade combinations
const colorVariants = Object.entries(customColors).flatMap(([color, shades]) =>
  Object.keys(shades).map((shade) => `${color}${shade}` as const)
);

const SPINNER_VARIANTS = ["color", "light", "dark", ...colorVariants] as const;

type SpinnerVariantType = (typeof SPINNER_VARIANTS)[number];
const pxSizeClasses: Record<SpinnerSizeType, string> = {
  xs: "16",
  sm: "20",
  md: "24",
  lg: "32",
  xl: "128",
  xxl: "192",
};

type LottieColorType = [number, number, number, number];

// Convert hex to RGB array [r, g, b, a]
const hexToRgba = (hex: string): [number, number, number, number] => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b, 1];
};

const colors: Record<Exclude<SpinnerVariantType, "color">, LottieColorType> = {
  light: [1, 1, 1, 1],
  dark: hexToRgba(customColors.gray[900]),
  ...Object.fromEntries(
    colorVariants.map((variant) => {
      const color = variant.match(/[a-z]+/)?.[0] as keyof typeof customColors;
      const shade = variant.match(
        /\d+/
      )?.[0] as unknown as keyof (typeof customColors)[typeof color];
      return [variant, hexToRgba(customColors[color][shade])];
    })
  ),
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
      anim =
        variant === "light"
          ? animSimpleLight
          : variant === "dark"
            ? animDarkXS
            : animColorXS;
      break;
    case "xl":
    case "xxl":
      anim =
        variant === "light"
          ? animLightLG
          : variant === "dark"
            ? animDarkLG
            : animColorLG;
      break;
    default:
      anim =
        variant === "light"
          ? animLightXS
          : variant === "dark"
            ? animDark
            : animColor;
  }

  const animationData =
    variant === "color"
      ? anim
      : replaceColors(JSON.parse(JSON.stringify(anim)), colors[variant]);

  return (
    <Lottie
      animationData={animationData}
      style={{ width: `${fullSize}px`, height: `${fullSize}px` }}
      loop
      autoplay
    />
  );
};

export default Spinner;
