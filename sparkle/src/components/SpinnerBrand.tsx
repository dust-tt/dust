import animSpinnerBrand from "@sparkle/lottie/spinnerDust";
import animSpinnerBrandColored from "@sparkle/lottie/spinnerDustColored";
import animSpinnerBrandColoredGray from "@sparkle/lottie/spinnerDustColoredGray";
import Lottie from "lottie-react";
import React from "react";

type SpinnerBrandSizeType = (typeof SPINNER_DUST_SIZES)[number];
const SPINNER_DUST_SIZES = ["xs", "sm", "md", "lg", "xl", "2xl"] as const;

type SpinnerBrandVariantType = (typeof SPINNER_DUST_VARIANTS)[number];
const SPINNER_DUST_VARIANTS = ["mono", "colored", "colored-gray"] as const;

export interface SpinnerBrandProps {
  size?: SpinnerBrandSizeType;
  variant?: SpinnerBrandVariantType;
}

const pxSizeClasses: Record<SpinnerBrandSizeType, number> = {
  xs: 16,
  sm: 20,
  md: 24,
  lg: 32,
  xl: 128,
  "2xl": 192,
};

const animationData: Record<SpinnerBrandVariantType, object> = {
  mono: animSpinnerBrand,
  colored: animSpinnerBrandColored,
  "colored-gray": animSpinnerBrandColoredGray,
};

const SpinnerBrand: React.FC<SpinnerBrandProps> = ({
  size = "md",
  variant = "mono",
}) => {
  const fullSize = pxSizeClasses[size];

  return (
    <Lottie
      animationData={animationData[variant]}
      style={{ width: `${fullSize}px`, height: `${fullSize}px` }}
      loop
      autoplay
    />
  );
};

export { SpinnerBrand };
