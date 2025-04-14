import type { SVGProps } from "react";
import * as React from "react";
const SvgListCheck = (props: SVGProps<SVGSVGElement>) => (
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
      fillRule="evenodd"
      d="M3 11V4h7v7H3Zm5-2V6H5v3h3Z"
      clipRule="evenodd"
    />
    <path
      fill="currentColor"
      d="M21 7h-8v2h8V7ZM21 17h-8v2h8v-2ZM6 20.414l4.707-4.707-1.414-1.414L6 17.586l-1.793-1.793-1.414 1.414L6 20.414Z"
    />
  </svg>
);
export default SvgListCheck;
