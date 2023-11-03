import type { SVGProps } from "react";
import * as React from "react";
const SvgTriangle = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="currentColor" d="m12 3 10.392 18H1.608L12 3Z" />
  </svg>
);
export default SvgTriangle;
