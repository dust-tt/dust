import type { SVGProps } from "react";
import * as React from "react";
const SvgArrowDown = (props: SVGProps<SVGSVGElement>) => (
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
      d="m13 16.171 5.364-5.364 1.414 1.415L12 20l-7.778-7.778 1.414-1.415L11 16.171V4h2V16.17Z"
    />
  </svg>
);
export default SvgArrowDown;
