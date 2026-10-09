import type { SVGProps } from "react";
import * as React from "react";

const SvgArrowUpRight = (props: SVGProps<SVGSVGElement>) => (
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
      d="M18.035 17a1.035 1.035 0 0 1-2.07 0V9.498L7.73 17.731A1.034 1.034 0 1 1 6.27 16.27l8.233-8.234H7a1.035 1.035 0 0 1 0-2.07h10c.572 0 1.035.463 1.035 1.035z"
    />
  </svg>
);
export default SvgArrowUpRight;
