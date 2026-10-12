import type { SVGProps } from "react";
import * as React from "react";

const SvgPw = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#338AF3"
      d="M10 20c5.523 0 10-4.477 10-10S15.523 0 10 0 0 4.477 0 10s4.477 10 10 10"
    />
    <path
      fill="#FFDA44"
      d="M7.826 14.348a4.348 4.348 0 1 0 0-8.696 4.348 4.348 0 0 0 0 8.696"
    />
  </svg>
);
export default SvgPw;
