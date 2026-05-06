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
      d="M19.269 5.268a1.034 1.034 0 1 1 1.462 1.463l-11 11a1.034 1.034 0 0 1-1.463 0l-5-5a1.034 1.034 0 1 1 1.463-1.463L9 15.538z"
    />
  </svg>
);
export default SvgCheck;
