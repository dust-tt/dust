import type { SVGProps } from "react";
import * as React from "react";
const SvgListAdd = (props: SVGProps<SVGSVGElement>) => (
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
      d="M14 13a3 3 0 0 0-3 3v2a3 3 0 0 0 3 3h2a3 3 0 0 0 3-3v-2a3 3 0 0 0-3-3h-2ZM16 3a3 3 0 0 0-3 3v2a3 3 0 0 0 3 3h2a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3h-2ZM6 3a3 3 0 0 0-3 3v2a3 3 0 0 0 3 3h2a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3H6Z"
      clipRule="evenodd"
    />
    <path
      fill="currentColor"
      d="m5.207 12.293-1.414 1.414L6.086 16H1v2h5.086l-2.293 2.293 1.414 1.414L9.914 17l-4.707-4.707Z"
    />
  </svg>
);
export default SvgListAdd;
