import type { SVGProps } from "react";
import * as React from "react";
const SvgArrowUp = (props: SVGProps<SVGSVGElement>) => (
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
      d="m11 7.828-5.364 5.364-1.414-1.414L12 4l7.778 7.778-1.414 1.414L13 7.828V20h-2V7.828Z"
    />
  </svg>
);
export default SvgArrowUp;
