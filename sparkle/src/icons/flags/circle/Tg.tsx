import type { SVGProps } from "react";
import * as React from "react";

const SvgTg = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#FFDA44"
      d="M10 20c5.523 0 10-4.477 10-10S15.523 0 10 0 0 4.477 0 10s4.477 10 10 10"
    />
    <path
      fill="#496E2D"
      d="M10 0c-.008 0-.436 4-.436 4H18a9.99 9.99 0 0 0-8-4M10 20a9.99 9.99 0 0 0 8-4H2a9.99 9.99 0 0 0 8 4M19.799 8H9.564L10 12h9.8a10 10 0 0 0 0-4"
    />
    <path
      fill="#D80027"
      d="M10 12V0C4.477 0 0 4.477 0 10c0 .685.07 1.354.2 2z"
    />
    <path
      fill="#F0F0F0"
      d="m5.518 4.783.648 1.992H8.26L6.566 8.007 7.214 10 5.518 8.768 3.823 10l.648-1.993-1.696-1.232h2.096z"
    />
  </svg>
);
export default SvgTg;
