import type { SVGProps } from "react";
import * as React from "react";

const SvgArrowsLeft = (props: SVGProps<SVGSVGElement>) => (
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
      d="M7.269 12.269a1.034 1.034 0 1 1 1.462 1.463l-2.233 2.233H20a1.035 1.035 0 0 1 0 2.07H6.498l2.233 2.234a1.034 1.034 0 1 1-1.462 1.463l-4-4a1.034 1.034 0 0 1 0-1.463zm5-10a1.034 1.034 0 1 1 1.463 1.462l-2.234 2.234H20a1.035 1.035 0 0 1 0 2.07h-8.502l2.234 2.234a1.034 1.034 0 1 1-1.463 1.463l-4-4a1.035 1.035 0 0 1 0-1.463z"
    />
  </svg>
);
export default SvgArrowsLeft;
