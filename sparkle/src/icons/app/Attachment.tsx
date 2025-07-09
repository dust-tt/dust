import type { SVGProps } from "react";
import * as React from "react";
const SvgAttachment = (props: SVGProps<SVGSVGElement>) => (
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
      d="M10.232 3.161a5.5 5.5 0 0 1 7.779 7.778l-5.657 5.657a3.5 3.5 0 1 1-4.95-4.95l6.01-6.01 2.122 2.121L9.38 13.92a.495.495 0 0 0 .7.7l5.81-5.802a2.5 2.5 0 0 0-3.536-3.535l-5.657 5.656a4.5 4.5 0 1 0 6.364 6.364l6.01-6.01 2.122 2.121-6.01 6.01A7.5 7.5 0 0 1 4.575 8.819l5.656-5.657Z"
    />
  </svg>
);
export default SvgAttachment;
