import type { SVGProps } from "react";
import * as React from "react";

const SvgArrowDown = (props: SVGProps<SVGSVGElement>) => (
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
      d="M10.965 19V5a1.035 1.035 0 0 1 2.07 0v14a1.035 1.035 0 0 1-2.07 0"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M18.269 11.269a1.034 1.034 0 1 1 1.462 1.462l-7 7a1.034 1.034 0 0 1-1.463 0l-7-7a1.034 1.034 0 1 1 1.463-1.463L12 17.538z"
    />
  </svg>
);
export default SvgArrowDown;
