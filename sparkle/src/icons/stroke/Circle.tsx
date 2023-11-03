import type { SVGProps } from "react";
import * as React from "react";
const SvgCircle = (props: SVGProps<SVGSVGElement>) => (
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
      d="M5 12a7 7 0 1 0 14 0 7 7 0 0 0-14 0Zm-2 0a9 9 0 1 0 18 0 9 9 0 0 0-18 0Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgCircle;
