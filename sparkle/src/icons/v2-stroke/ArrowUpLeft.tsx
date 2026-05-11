import type { SVGProps } from "react";
import * as React from "react";

const SvgArrowUpLeft = (props: SVGProps<SVGSVGElement>) => (
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
      d="M5.965 17V7c0-.572.463-1.035 1.035-1.035h10a1.035 1.035 0 0 1 0 2.07H9.498l8.233 8.234a1.034 1.034 0 1 1-1.462 1.462L8.035 9.498V17a1.035 1.035 0 0 1-2.07 0"
    />
  </svg>
);
export default SvgArrowUpLeft;
