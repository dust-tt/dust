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
      d="m10.5 8.5-5 5-2-2L12 3l8.5 8.5-2 2-5-5V21h-3V8.5Z"
    />
  </svg>
);
export default SvgArrowUp;
