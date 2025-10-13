import type { SVGProps } from "react";
import * as React from "react";
const SvgFrame = (props: SVGProps<SVGSVGElement>) => (
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
      d="M21 3.107v18H3v-18h18Zm-9.811 10.158L5 14.355v4.752h7.218l-1.03-5.842ZM19 5.107h-7.219l2.468 14H19v-14Zm-9.25 0H5v7.218l5.841-1.03L9.75 5.108Z"
    />
  </svg>
);
export default SvgFrame;
