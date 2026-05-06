import type { SVGProps } from "react";
import * as React from "react";

const SvgArrowNarrowLeft = (props: SVGProps<SVGSVGElement>) => (
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
      d="M20 10.965a1.035 1.035 0 0 1 0 2.07H4a1.035 1.035 0 0 1 0-2.07z"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M9.269 5.269a1.034 1.034 0 1 1 1.463 1.462L5.463 12l5.269 5.269a1.034 1.034 0 1 1-1.463 1.463l-6-6a1.034 1.034 0 0 1 0-1.463z"
    />
  </svg>
);
export default SvgArrowNarrowLeft;
