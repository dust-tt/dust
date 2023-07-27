import React from "react";

import SvgLogoColoredGrey from "./LogoColoredGrey";
import SvgLogoFullColor from "./LogoFullColor";
import SvgLogoSquareColoredGrey from "./LogoSquareColoredGrey";
import SvgLogoSquareFullColor from "./LogoSquareFullColor";

interface LogoProps {
  type?: "full-color" | "colored-grey";
  shape?: "square" | "full";
  className?: string;
}

export function Logo({
  type = "full-color",
  shape = "full",
  className = "",
}: LogoProps) {
  if (shape === "square") {
    if (type === "colored-grey") {
      return <SvgLogoSquareColoredGrey className={className} />;
    } else {
      return <SvgLogoSquareFullColor className={className} />;
    }
  } else {
    if (type === "colored-grey") {
      return <SvgLogoColoredGrey className={className} />;
    } else {
      return <SvgLogoFullColor className={className} />;
    }
  }
}
