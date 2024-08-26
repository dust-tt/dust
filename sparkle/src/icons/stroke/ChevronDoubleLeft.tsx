import type { SVGProps } from "react";
import * as React from "react";
const SvgChevronDoubleLeft = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="currentColor" d="m12 17-5-5 5-5-1.5-1.5L4 12l6.5 6.5L12 17Z" />
    <path fill="currentColor" d="m19 17-5-5 5-5-1.5-1.5L11 12l6.5 6.5L19 17Z" />
  </svg>
);
export default SvgChevronDoubleLeft;
