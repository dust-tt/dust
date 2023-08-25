import * as React from "react";
import type { SVGProps } from "react";
const SvgChevronRight = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="currentColor" d="M13 12 8 7l1.5-1.5L16 12l-6.5 6.5L8 17l5-5Z" />
  </svg>
);
export default SvgChevronRight;
