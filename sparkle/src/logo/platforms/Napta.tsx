import type { SVGProps } from "react";
import * as React from "react";

const SvgNapta = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 200 200"
    {...props}
  >
    <path
      fill="#00cb9c"
      d="M100,50h0C100,22.39,77.61,0,50,0S0,22.39,0,50V200H50V50l50,50V50Z"
    />
    <path
      fill="#00cb9c"
      d="M150,150h0l-50-50v50h0c0,27.61,22.39,50,50,50s50-22.39,50-50h0V0h-50V150Z"
    />
  </svg>
);
export default SvgNapta;
