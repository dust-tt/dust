import type { SVGProps } from "react";
import * as React from "react";

const SvgArrowNarrowUpLeft = (props: SVGProps<SVGSVGElement>) => (
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
      d="M5.269 5.268a1.034 1.034 0 0 1 1.463 0l12 12a1.034 1.034 0 1 1-1.463 1.463l-12-12a1.034 1.034 0 0 1 0-1.463"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M4.965 14V6c0-.572.463-1.035 1.035-1.035h8a1.035 1.035 0 0 1 0 2.07H7.035V14a1.035 1.035 0 0 1-2.07 0"
    />
  </svg>
);
export default SvgArrowNarrowUpLeft;
