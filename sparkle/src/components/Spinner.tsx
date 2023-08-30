import Rive from "@rive-app/react-canvas";
import React from "react";

import { classNames } from "@sparkle/lib/utils";

export interface SpinnerProps {
  size?: "xs" | "sm" | "md" | "lg";
}

const Spinner: React.FC<SpinnerProps> = ({ size = "md" }) => {
  const sizeClasses = {
    xs: "s-h-4 s-w-4",
    sm: "s-h-5 s-w-5",
    md: "s-h-6 s-w-6",
    lg: "s-h-8 s-w-8",
  };

  return (
    <>
      <div>
        <Rive src="/animations/spinner.riv" />
      </div>
    </>
  );
};

export default Spinner;
