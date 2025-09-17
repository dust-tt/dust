import type { SVGProps } from "react";
import * as React from "react";
const SvgArrowGoForward = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 25"
    {...props}
  >
    <path
      fill="#000"
      d="M16 7.036h-5c-3.314 0-6 2.7-6 6.032 0 3.33 2.686 6.031 6 6.031h9v2.01h-9c-4.418 0-8-3.6-8-8.041 0-4.442 3.582-8.042 8-8.042h5v-4.02l6 5.025-6 5.026v-4.02Z"
    />
  </svg>
);
export default SvgArrowGoForward;
