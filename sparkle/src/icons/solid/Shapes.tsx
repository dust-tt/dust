import type { SVGProps } from "react";
import * as React from "react";
const SvgShapes = (props: SVGProps<SVGSVGElement>) => (
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
      d="m12 1 6 10H6zm1 12.5h8v8h-8zM6.75 22a4.75 4.75 0 1 0 0-9.5 4.75 4.75 0 0 0 0 9.5"
    />
  </svg>
);
export default SvgShapes;
