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
    <path fill="currentColor" d="m11 12 5 5-1.5 1.5L8 12l6.5-6.5L16 7l-5 5Z" />
  </svg>
);
export default SvgChevronLeft;
