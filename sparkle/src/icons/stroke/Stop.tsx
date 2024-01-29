import type { SVGProps } from "react";
import * as React from "react";
const SvgStop = (props: SVGProps<SVGSVGElement>) => (
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
      d="M17 7H7v10h10V7ZM5 5v14h14V5H5Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgStop;
