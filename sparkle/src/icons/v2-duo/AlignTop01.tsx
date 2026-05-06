import type { SVGProps } from "react";
import * as React from "react";

const SvgAlignTop01 = (props: SVGProps<SVGSVGElement>) => (
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
      d="M21 1.965a1.035 1.035 0 0 1 0 2.07H3a1.035 1.035 0 0 1 0-2.07z"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M10.965 21V9.498L5.73 14.732a1.034 1.034 0 1 1-1.463-1.463l7-7 .079-.072a1.035 1.035 0 0 1 1.384.072l7 7a1.034 1.034 0 1 1-1.463 1.463l-5.233-5.234V21a1.035 1.035 0 0 1-2.07 0"
    />
  </svg>
);
export default SvgAlignTop01;
