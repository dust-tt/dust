import type { SVGProps } from "react";
import * as React from "react";
const SvgListRemove = (props: SVGProps<SVGSVGElement>) => (
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
      d="M15 13a3 3 0 0 0-3 3v2a3 3 0 0 0 3 3h2a3 3 0 0 0 3-3v-2a3 3 0 0 0-3-3zM16 3a3 3 0 0 0-3 3v2a3 3 0 0 0 3 3h2a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3zM6 3a3 3 0 0 0-3 3v2a3 3 0 0 0 3 3h2a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3z"
      clipRule="evenodd"
    />
    <path
      fill="currentColor"
      d="m5.707 21.707 1.414-1.414L4.828 18h5.086v-2H4.83l2.292-2.293-1.414-1.414L1 17z"
    />
  </svg>
);
export default SvgListRemove;
