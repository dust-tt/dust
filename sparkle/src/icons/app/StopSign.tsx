import type { SVGProps } from "react";
import * as React from "react";
const SvgStopSign = (props: SVGProps<SVGSVGElement>) => (
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
      d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12s4.48 10 10 10 10-4.48 10-10Zm-4-1.5H6v3h12v-3Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgStopSign;
