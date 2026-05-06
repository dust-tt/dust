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
      d="M10.965 19V5a1.035 1.035 0 0 1 2.07 0v14a1.035 1.035 0 0 1-2.07 0"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M11.347 4.197a1.035 1.035 0 0 1 1.385.072l7 7a1.034 1.034 0 1 1-1.463 1.463L12 6.463l-6.268 6.269a1.034 1.034 0 1 1-1.463-1.463l7-7z"
    />
  </svg>
);
export default SvgArrowUp;
