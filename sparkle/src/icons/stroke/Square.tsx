import type { SVGProps } from "react";
import * as React from "react";
const SvgSquare = (props: SVGProps<SVGSVGElement>) => (
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
      d="M18 6H6v12h12zM4 4v16h16V4z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgSquare;
