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
    <path fill="#111418" d="M8 11a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" />
    <path
      fill="#111418"
      fillRule="evenodd"
      d="M2 21V3h20v18H2Zm18-6V5H4v14L14 9l6 6Zm0 2.828-6-6L6.828 19H20v-1.172Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgImage;
