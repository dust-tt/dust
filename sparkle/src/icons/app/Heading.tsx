import type { SVGProps } from "react";
import * as React from "react";
const SvgHeading = (props: SVGProps<SVGSVGElement>) => (
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
      d="M15 10V3.995h3v16.01h-3V13H9v7.005H6V3.995h3V10h6Z"
    />
  </svg>
);
export default SvgHeading;
