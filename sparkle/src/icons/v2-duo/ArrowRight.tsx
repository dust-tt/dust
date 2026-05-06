import type { SVGProps } from "react";
import * as React from "react";

const SvgArrowRight = (props: SVGProps<SVGSVGElement>) => (
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
      d="M19 10.965a1.035 1.035 0 0 1 0 2.07H5a1.035 1.035 0 0 1 0-2.07z"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M11.269 4.268a1.034 1.034 0 0 1 1.463 0l7 7a1.034 1.034 0 0 1 0 1.463l-7 7a1.034 1.034 0 1 1-1.463-1.463L17.538 12 11.269 5.73a1.034 1.034 0 0 1 0-1.463"
    />
  </svg>
);
export default SvgArrowRight;
