import type { SVGProps } from "react";
import * as React from "react";
const SvgUserArrow = (props: SVGProps<SVGSVGElement>) => (
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
      d="M9 13A5 5 0 1 0 9 3a5 5 0 0 0 0 10Zm0-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
      clipRule="evenodd"
    />
    <path
      fill="currentColor"
      d="M1 22a8 8 0 1 1 16 0h-2a6 6 0 0 0-12 0H1ZM22 13l-4-4v3h-4v2h4v3l4-4Z"
    />
  </svg>
);
export default SvgUserArrow;
