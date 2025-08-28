import type { SVGProps } from "react";
import * as React from "react";
const SvgBell = (props: SVGProps<SVGSVGElement>) => (
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
      d="M20 17h2v2H2v-2h2v-7a8 8 0 1 1 16 0v7ZM9 21h6v2H9v-2Z"
    />
  </svg>
);
export default SvgBell;
