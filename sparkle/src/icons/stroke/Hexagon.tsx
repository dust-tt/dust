import type { SVGProps } from "react";
import * as React from "react";
const SvgHexagon = (props: SVGProps<SVGSVGElement>) => (
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
      d="M16.347 5H7.653l-4.342 7.5L7.653 20h8.694l4.342-7.5L16.347 5ZM23 12.5 17.5 3h-11L1 12.5 6.5 22h11l5.5-9.5Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgHexagon;
