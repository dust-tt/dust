import type { SVGProps } from "react";
import * as React from "react";

const SvgChevronUp = (props: SVGProps<SVGSVGElement>) => (
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
      d="M11.347 8.197a1.035 1.035 0 0 1 1.385.072l6 6a1.034 1.034 0 1 1-1.463 1.463L12 10.463l-5.268 5.269a1.034 1.034 0 1 1-1.463-1.463l6-6z"
    />
  </svg>
);
export default SvgChevronUp;
