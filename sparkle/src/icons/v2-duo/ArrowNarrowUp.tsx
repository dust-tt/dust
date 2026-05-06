import type { SVGProps } from "react";
import * as React from "react";

const SvgArrowNarrowUp = (props: SVGProps<SVGSVGElement>) => (
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
      d="M10.965 20V4a1.035 1.035 0 0 1 2.07 0v16a1.035 1.035 0 0 1-2.07 0"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M11.347 3.197a1.035 1.035 0 0 1 1.385.072l6 6a1.034 1.034 0 1 1-1.463 1.462L12 5.463 6.732 10.73A1.034 1.034 0 1 1 5.269 9.27l6-6z"
    />
  </svg>
);
export default SvgArrowNarrowUp;
