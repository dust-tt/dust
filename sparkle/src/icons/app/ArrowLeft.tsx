import type { SVGProps } from "react";
import * as React from "react";
const SvgArrowLeft = (props: SVGProps<SVGSVGElement>) => (
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
      d="m8.5 13.5 5 5-2 2L3 12l8.5-8.5 2 2-5 5H21v3H8.5Z"
    />
  </svg>
);
export default SvgArrowLeft;
