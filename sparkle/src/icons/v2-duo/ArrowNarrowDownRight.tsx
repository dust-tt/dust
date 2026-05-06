import type { SVGProps } from "react";
import * as React from "react";

const SvgArrowNarrowDownRight = (props: SVGProps<SVGSVGElement>) => (
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
      d="M5.269 5.269a1.034 1.034 0 0 1 1.463 0l12 12a1.034 1.034 0 1 1-1.463 1.463l-12-12a1.034 1.034 0 0 1 0-1.463"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M16.965 10a1.035 1.035 0 0 1 2.07 0v8c0 .572-.463 1.035-1.035 1.035h-8a1.035 1.035 0 0 1 0-2.07h6.965z"
    />
  </svg>
);
export default SvgArrowNarrowDownRight;
