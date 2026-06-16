import type { SVGProps } from "react";
import * as React from "react";

const SvgDot = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <circle cx="12" cy="12" r="4" fill="currentColor" />
  </svg>
);
export default SvgDot;
