import type { SVGProps } from "react";
import * as React from "react";

const SvgGw = (props: SVGProps<SVGSVGElement>) => (
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
      d="M10 0C9.097 0 8.223.12 7.39.344L6.521 10l.87 9.656A10 10 0 0 0 10 20c5.523 0 10-4.477 10-10S15.523 0 10 0"
    />
    <path
      fill="#6DA544"
      d="m6.521 10 .87 9.656A10 10 0 0 0 10 20c5.523 0 10-4.477 10-10z"
    />
    <path
      fill="#D80027"
      d="M0 10a10 10 0 0 0 5.217 8.784V1.216A10 10 0 0 0 0 10"
    />
    <path
      fill="#D80027"
      d="M0 10c0 4.62 3.134 8.508 7.391 9.656V.343C3.134 1.492 0 5.38 0 10"
    />
    <path
      fill="#000"
      d="m3.778 7.391.648 1.993H6.52l-1.695 1.232.647 1.993-1.695-1.232-1.695 1.232.647-1.993-1.695-1.232h2.096z"
    />
  </svg>
);
export default SvgGw;
