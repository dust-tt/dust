import type { SVGProps } from "react";
import * as React from "react";
const SvgSuitcase = (props: SVGProps<SVGSVGElement>) => (
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
      d="M8 4v3H5a3 3 0 0 0-3 3v9a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3v-9a3 3 0 0 0-3-3h-3V4a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1Zm2 3V5h4v2h-4Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgSuitcase;
