import type { SVGProps } from "react";
import * as React from "react";
const SvgPause = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="#000" d="M6 5h4v14H6V5Zm8 0h4v14h-4V5Z" />
  </svg>
);
export default SvgPause;
