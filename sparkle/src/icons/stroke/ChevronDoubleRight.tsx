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
    <path fill="currentColor" d="m12 7 5 5-5 5 1.5 1.5L20 12l-6.5-6.5L12 7Z" />
    <path fill="currentColor" d="m5 7 5 5-5 5 1.5 1.5L13 12 6.5 5.5 5 7Z" />
  </svg>
);
export default SvgChevronDoubleRight;
