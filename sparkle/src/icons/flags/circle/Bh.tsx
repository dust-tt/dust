import type { SVGProps } from "react";
import * as React from "react";

const SvgBh = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#F0F0F0"
      d="M10 20c5.523 0 10-4.477 10-10S15.523 0 10 0 0 4.477 0 10s4.477 10 10 10"
    />
    <path
      fill="#D80027"
      d="M10 0a9.95 9.95 0 0 0-5.442 1.61l2.571 1.723L3.912 5 7.13 6.666 3.912 8.333 7.13 9.999l-3.217 1.667 3.217 1.667-3.217 1.666 3.217 1.667-2.572 1.724A9.95 9.95 0 0 0 10 20c5.523 0 10-4.477 10-10S15.522 0 10 0"
    />
  </svg>
);
export default SvgBh;
