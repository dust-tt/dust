import animSpinnerBrand from "@sparkle/lottie/spinnerDust";
import animSpinnerBrandColored from "@sparkle/lottie/spinnerDustColored";
import animSpinnerBrandColoredGray from "@sparkle/lottie/spinnerDustColoredGray";
import Lottie, { type LottieRefCurrentProps } from "lottie-react";
import React, { useEffect, useRef } from "react";

type SpinnerBrandSizeType = (typeof SPINNER_BRAND_SIZES)[number];
const SPINNER_BRAND_SIZES = ["xs", "sm", "md", "lg", "xl", "2xl"] as const;

type SpinnerBrandVariantType = (typeof SPINNER_BRAND_VARIANTS)[number];
const SPINNER_BRAND_VARIANTS = [
  "mono",
  "mono-white",
  "colored",
  "colored-gray",
] as const;

export interface SpinnerBrandProps {
  size?: SpinnerBrandSizeType;
  variant?: SpinnerBrandVariantType;
  speed?: number;
}

const pxSizeClasses: Record<SpinnerBrandSizeType, number> = {
  xs: 16,
  sm: 20,
  md: 24,
  lg: 32,
  xl: 128,
  "2xl": 192,
};

type LottieColorType = [number, number, number, number];

const isColorArray = (arr: unknown): arr is LottieColorType => {
  return (
    Array.isArray(arr) &&
    (arr.length === 3 || arr.length === 4) &&
    arr.every((n) => typeof n === "number")
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const replaceColors = (obj: any, newColor: LottieColorType): any => {
  if (Array.isArray(obj)) {
    return obj.map((item) => replaceColors(item, newColor));
  } else if (obj !== null && typeof obj === "object") {
    for (const key in obj) {
      if (isColorArray(obj[key])) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        obj[key] =
          (obj[key] as any[]).length === 3 ? newColor.slice(0, 3) : newColor;
      } else {
        obj[key] = replaceColors(obj[key], newColor);
      }
    }
  }
  return obj;
};

const animSpinnerBrandMonoWhite = replaceColors(
  JSON.parse(JSON.stringify(animSpinnerBrand)),
  [1, 1, 1, 1]
);

const animationData: Record<SpinnerBrandVariantType, object> = {
  mono: animSpinnerBrand,
  "mono-white": animSpinnerBrandMonoWhite,
  colored: animSpinnerBrandColored,
  "colored-gray": animSpinnerBrandColoredGray,
};

const SpinnerBrand: React.FC<SpinnerBrandProps> = ({
  size = "md",
  variant = "mono",
  speed = 0.4,
}) => {
  const fullSize = pxSizeClasses[size];
  const lottieRef = useRef<LottieRefCurrentProps | null>(null);

  useEffect(() => {
    lottieRef.current?.setSpeed(speed);
  }, [speed]);

  return (
    <Lottie
      lottieRef={lottieRef}
      animationData={animationData[variant]}
      style={{ width: `${fullSize}px`, height: `${fullSize}px` }}
      loop
      autoplay
    />
  );
};

export { SpinnerBrand };
