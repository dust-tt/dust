import type { SVGProps } from "react";
import * as React from "react";
const SvgMap = (props: SVGProps<SVGSVGElement>) => (
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
      d="m2 5 7-3 6 3 6.303-2.701a.5.5 0 0 1 .697.46V19l-7 3-6-3-6.303 2.701a.5.5 0 0 1-.697-.46V5Zm14 14.395 4-1.714V5.033l-4 1.714v12.648Zm-2-.131V6.736l-4-2v12.528l4 2Zm-6-2.011V4.605L4 6.319v12.648l4-1.714Z"
    />
  </svg>
);
export default SvgMap;
