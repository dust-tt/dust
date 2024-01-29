import type { SVGProps } from "react";
import * as React from "react";
const SvgPlay = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="currentColor" d="M20 12 8 20V4l12 8Z" />
  </svg>
);
export default SvgPlay;
