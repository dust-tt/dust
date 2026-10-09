import type { SVGProps } from "react";
import * as React from "react";

const SvgFilterLines = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="currentColor"
      d="M15 17a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2zm3-6a1 1 0 1 1 0 2H6a1 1 0 1 1 0-2zm3-6a1 1 0 1 1 0 2H3a1 1 0 0 1 0-2z"
    />
  </svg>
);
export default SvgFilterLines;
