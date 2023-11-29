import type { SVGProps } from "react";
import * as React from "react";
const SvgArrowLeft = (props: SVGProps<SVGSVGElement>) => (
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
      d="m7.828 13 5.364 5.364-1.414 1.414L4 12l7.778-7.778 1.414 1.414L7.828 11H20v2H7.828Z"
    />
  </svg>
);
export default SvgArrowLeft;
