import type { SVGProps } from "react";
import * as React from "react";
const SvgChevronUpDown = (props: SVGProps<SVGSVGElement>) => (
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
      d="M8.5 11 12 7.5l3.5 3.5 2-2L12 3.5 6.5 9l2 2ZM15.5 13 12 16.5 8.5 13l-2 2 5.5 5.5 5.5-5.5-2-2Z"
    />
  </svg>
);
export default SvgChevronUpDown;
