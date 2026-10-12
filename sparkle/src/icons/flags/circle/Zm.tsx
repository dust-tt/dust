import type { SVGProps } from "react";
import * as React from "react";

const SvgZm = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#496E2D"
      d="M10 20c5.523 0 10-4.477 10-10S15.523 0 10 0 0 4.477 0 10s4.477 10 10 10"
    />
    <path fill="#D80027" d="M13.913 10H10v10c1.169 0 2.29-.201 3.333-.57z" />
    <path fill="#FF9811" d="M16.668 17.453A9.98 9.98 0 0 0 20 10h-3.913z" />
    <path fill="#000" d="M13.334 10v9.43a10 10 0 0 0 3.333-1.977V10z" />
    <path
      fill="#FF9811"
      d="M18.478 6.522h-2.609a.87.87 0 1 0-1.739 0h-2.609c0 .48.419.87.899.87h-.029c0 .48.39.869.87.869 0 .48.389.87.87.87h1.738c.48 0 .87-.39.87-.87.48 0 .87-.39.87-.87h-.03c.48 0 .899-.389.899-.87"
    />
  </svg>
);
export default SvgZm;
