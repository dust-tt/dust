import Lottie from "lottie-react";
import React from "react";

import { classNames } from "@sparkle/lib/utils";
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
  size?: "xs" | "sm" | "md" | "lg";
  variant?: "success" | "action" | "lightGrey" | "darkGrey" | "white";
}
const sizeClasses = {
  xs: "s-h-4 s-w-4",
  sm: "s-h-5 s-w-5",
  md: "s-h-6 s-w-6",
  lg: "s-h-8 s-w-8",
};

const Spinner: React.FC<SpinnerProps> = ({
  size = "md",
  variant = "lightGrey",
}) => {
  const colorClasses = {
    success: "s-bg-success-500",
    action: "s-bg-action-500 dark:s-bg-action-500-dark",
    white: "s-bg-structure-0 dark:s-bg-black",
    lightGrey: "s-bg-element-600 dark:s-bg-element-600-dark",
    darkGrey: "s-bg-element-800 dark:s-bg-element-900-dark",
  };

  const colorSecClasses = {
    success: "s-bg-success-300",
    action: "s-bg-sky-300 dark:s-bg-sky-700",
    white: "s-opacity-40 s-bg-structure-0 dark:s-bg-structure-0-dark",
    lightGrey: "s-bg-element-500 dark:s-bg-element-500-dark",
    darkGrey: "s-bg-element-600 dark:s-bg-element-600-dark",
  };

  return (
    <>
      <div className={classNames("s-relative", sizeClasses[size])}>
        <div
          className={classNames(
            "s-absolute s-inset-0 s-rounded-full",
            colorSecClasses[variant]
          )}
        />
        <div
          className={classNames(
            "s-absolute s-left-0 s-animate-move-square",
            sizeClasses[size]
          )}
        >
          <div
            className={classNames("s-h-full s-w-full", colorClasses[variant])}
          />
        </div>
      </div>
    </>
  );
};

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
export default Spinner;
export { Spinner2 };
