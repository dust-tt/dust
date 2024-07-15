import type { SVGProps } from "react";
import * as React from "react";
const SvgTag = (props: SVGProps<SVGSVGElement>) => (
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
      d="M1 12 11 2l7.558.756a3 3 0 0 1 2.686 2.686L22 13 12 23 1 12Zm14-1a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgTag;
