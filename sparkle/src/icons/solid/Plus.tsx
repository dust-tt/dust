import type { SVGProps } from "react";
import * as React from "react";
const SvgPlus = (props: SVGProps<SVGSVGElement>) => (
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
      d="M10.5 10.5V5h3v5.5H19v3h-5.5V19h-3v-5.5H5v-3h5.5Z"
    />
  </svg>
);
export default SvgPlus;
