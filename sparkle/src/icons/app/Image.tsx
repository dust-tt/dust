import type { SVGProps } from "react";
import * as React from "react";
const SvgImage = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="currentColor" d="M8 11a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" />
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M2 21V3h20v18H2Zm18-6V5H4v14L14 9l6 6Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgImage;
