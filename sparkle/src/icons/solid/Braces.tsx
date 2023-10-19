import type { SVGProps } from "react";
import * as React from "react";
const SvgBraces = (props: SVGProps<SVGSVGElement>) => (
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
      d="M1 10.7v2.6h1.5a1 1 0 0 1 1 1v3.2A3.5 3.5 0 0 0 7 21h2v-3H7a.5.5 0 0 1-.5-.5V14c0-1-.5-1.5-1.5-2 1-.5 1.5-1 1.5-2V6.5A.5.5 0 0 1 7 6h2V3H7a3.5 3.5 0 0 0-3.5 3.5v3.2a1 1 0 0 1-1 1H1ZM15 18v3h2a3.5 3.5 0 0 0 3.5-3.5v-3.2a1 1 0 0 1 1-1H23v-2.6h-1.5a1 1 0 0 1-1-1V6.5A3.5 3.5 0 0 0 17 3h-2v3h2a.5.5 0 0 1 .5.5V10c0 1 .5 1.5 1.5 2-1 .5-1.5 1-1.5 2v3.5a.5.5 0 0 1-.5.5h-2Z"
    />
  </svg>
);
export default SvgBraces;
