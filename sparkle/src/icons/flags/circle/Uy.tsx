import type { SVGProps } from "react";
import * as React from "react";

const SvgUy = (props: SVGProps<SVGSVGElement>) => (
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
      d="M10 7.391h9.656a10 10 0 0 0-1.124-2.608H10zM3.774 17.826h12.45a10 10 0 0 0 2.307-2.609H1.467a10 10 0 0 0 2.307 2.61M10 0v2.174h6.225A9.96 9.96 0 0 0 10 0"
    />
    <path
      fill="#338AF3"
      d="M10 7.391h9.656a10 10 0 0 0-1.124-2.608H10zM0 10c0 .903.12 1.777.344 2.609h19.312A10 10 0 0 0 20 10z"
    />
    <path
      fill="#FFDA44"
      d="m8.696 5.852-1.22.575.65 1.183-1.327-.254-.168 1.34-.923-.986-.924.986-.168-1.34-1.326.254.65-1.183-1.221-.575 1.221-.574-.65-1.183 1.326.254.168-1.34.924.985.923-.985.168 1.34 1.327-.254-.65 1.183z"
    />
  </svg>
);
export default SvgUy;
