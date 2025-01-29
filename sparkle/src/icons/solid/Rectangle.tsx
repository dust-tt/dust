import type { SVGProps } from "react";
import * as React from "react";
const SvgRectangle = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="currentColor" d="M7 2h10v20H7z" />
  </svg>
);
export default SvgRectangle;
