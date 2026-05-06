import type { SVGProps } from "react";
import * as React from "react";

const SvgChevronUpDouble = (props: SVGProps<SVGSVGElement>) => (
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
      d="M11.347 12.197a1.035 1.035 0 0 1 1.385.072l5 5a1.034 1.034 0 1 1-1.463 1.463L12 14.463l-4.268 4.269a1.034 1.034 0 1 1-1.463-1.463l5-5z"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M11.347 5.197a1.035 1.035 0 0 1 1.385.072l5 5a1.034 1.034 0 1 1-1.463 1.463L12 7.463l-4.268 4.269a1.034 1.034 0 1 1-1.463-1.463l5-5z"
    />
  </svg>
);
export default SvgChevronUpDouble;
