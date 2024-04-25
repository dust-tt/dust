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

export interface Spinner2Props {
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "xxl";
  variant?: "color" | "light" | "dark";
}
const pxSizeClasses = {
  xs: "16",
  sm: "20",
  md: "24",
  lg: "32",
  xl: "128",
  xxl: "192",
};

const Spinner2: React.FC<Spinner2Props> = ({
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

  return (
    <Lottie
      animationData={anim}
      style={{ width: `${fullSize}px`, height: `${fullSize}px` }}
      loop
      autoplay
    />
  );
};

export default Spinner2;
