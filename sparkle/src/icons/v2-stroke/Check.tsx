import type { SVGProps } from "react";
import * as React from "react";

const SvgCheck = (props: SVGProps<SVGSVGElement>) => (
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
      d="M19.269 5.269A1.034 1.034 0 1 1 20.73 6.73l-11 11a1.034 1.034 0 0 1-1.462 0l-5-5A1.034 1.034 0 1 1 4.73 11.27L9 15.537z"
    />
  </svg>
);
export default SvgCheck;
