import type { SVGProps } from "react";
import * as React from "react";

const SvgTw = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#D80027"
      d="M20 10c0 5.523-4.477 10-10 10S0 15.523 0 10L10 0c5.523 0 10 4.477 10 10"
    />
    <path fill="#0052B4" d="M10 10V0C4.477 0 0 4.477 0 10z" />
    <path
      fill="#F0F0F0"
      d="m8.696 5.852-1.22.575.65 1.183-1.327-.254-.168 1.34-.923-.986-.924.986-.168-1.34-1.326.254.65-1.183-1.221-.575 1.221-.574-.65-1.183 1.326.254.168-1.34.924.985.923-.985.168 1.34 1.327-.254-.65 1.183z"
    />
    <path
      fill="#0052B4"
      d="M5.707 7.714a1.861 1.861 0 1 0 0-3.723 1.861 1.861 0 0 0 0 3.723"
    />
    <path
      fill="#F0F0F0"
      d="M5.707 6.844a.993.993 0 0 1 0-1.984.993.993 0 0 1 0 1.984"
    />
  </svg>
);
export default SvgTw;
