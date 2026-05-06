import type { SVGProps } from "react";
import * as React from "react";

const SvgReverseRight = (props: SVGProps<SVGSVGElement>) => (
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
      d="M2.965 13A7.035 7.035 0 0 1 10 5.965h10a1.035 1.035 0 0 1 0 2.07H10a4.965 4.965 0 1 0 0 9.93h10a1.035 1.035 0 0 1 0 2.07H10A7.035 7.035 0 0 1 2.965 13"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M15.269 2.268a1.034 1.034 0 0 1 1.463 0l4 4a1.034 1.034 0 0 1 0 1.463l-4 4a1.034 1.034 0 1 1-1.463-1.463L18.538 7 15.269 3.73a1.034 1.034 0 0 1 0-1.463"
    />
  </svg>
);
export default SvgReverseRight;
