import type { SVGProps } from "react";
import * as React from "react";
const SvgChevronLeft = (props: SVGProps<SVGSVGElement>) => (
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
      d="m11.5 12 4.5 4.5-2 2L7.5 12 14 5.5l2 2-4.5 4.5Z"
    />
  </svg>
);
export default SvgChevronLeft;
