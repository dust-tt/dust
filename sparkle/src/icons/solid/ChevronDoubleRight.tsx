import type { SVGProps } from "react";
import * as React from "react";
const SvgChevronDoubleRight = (props: SVGProps<SVGSVGElement>) => (
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
      d="m12 7.5 4.5 4.5-4.5 4.5 2 2 6.5-6.5L14 5.5l-2 2Z"
    />
    <path
      fill="currentColor"
      d="M4.5 7.5 9 12l-4.5 4.5 2 2L13 12 6.5 5.5l-2 2Z"
    />
  </svg>
);
export default SvgChevronDoubleRight;
