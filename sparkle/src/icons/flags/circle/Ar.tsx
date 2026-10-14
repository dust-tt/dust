import type { SVGProps } from "react";
import * as React from "react";

const SvgAr = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#F0F0F0"
      d="M10 20c5.523 0 10-4.477 10-10S15.523 0 10 0 0 4.477 0 10s4.477 10 10 10"
    />
    <path
      fill="#338AF3"
      d="M10 0A10 10 0 0 0 .992 5.652h18.016A10 10 0 0 0 10 0M10 20a10 10 0 0 0 9.008-5.652H.992A10 10 0 0 0 10 20"
    />
    <path
      fill="#FFDA44"
      d="m12.99 10-1.222.575.65 1.182-1.326-.253-.168 1.34-.923-.986-.924.985-.168-1.34-1.326.254.65-1.182L7.012 10l1.221-.574-.65-1.183 1.326.253.168-1.34.924.986.923-.985.168 1.34 1.327-.254-.65 1.183z"
    />
  </svg>
);
export default SvgAr;
