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
      d="m13 16.172 5.364-5.365 1.414 1.415L12 20l-7.778-7.778 1.414-1.415L11 16.172V4h2v12.172Z"
    />
  </svg>
);
export default SvgArrowDown;
