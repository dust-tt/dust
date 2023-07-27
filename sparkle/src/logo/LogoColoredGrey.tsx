import type { SVGProps } from "react";
import * as React from "react";
const SvgLogoColoredGrey = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 96 24"
    {...props}
  >
    <path
      fill="#64748B"
      fillRule="evenodd"
      d="M12 24c6.627 0 12-5.373 12-12 0 6.627 5.373 12 12 12s12-5.373 12-12v12h12a6 6 0 0 0 0-12H48c0-6.627-5.373-12-12-12S24 5.373 24 12c0-6.627-5.373-12-12-12S0 5.373 0 12s5.373 12 12 12Zm72-12H72v12h12V12Z"
      clipRule="evenodd"
    />
    <path
      fill="#334155"
      fillRule="evenodd"
      d="M0 0h12v24H0V0Zm24 0h24v12H24V0Zm36 12h36V0H60a6 6 0 0 0 0 12Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgLogoColoredGrey;
