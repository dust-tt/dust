import type { SVGProps } from "react";
import * as React from "react";
const SvgArrowDownS = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="currentColor" d="m12 16-6-6h12l-6 6Z" />
  </svg>
);
export default SvgArrowDownS;
