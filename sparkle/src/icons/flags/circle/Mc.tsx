import type { SVGProps } from "react";
import * as React from "react";

const SvgMc = (props: SVGProps<SVGSVGElement>) => (
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
    <path fill="#D80027" d="M0 10C0 4.477 4.477 0 10 0s10 4.477 10 10" />
  </svg>
);
export default SvgMc;
