import type { SVGProps } from "react";
import * as React from "react";

const SvgArrowLeft = (props: SVGProps<SVGSVGElement>) => (
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
      d="M11.269 4.269a1.034 1.034 0 1 1 1.463 1.462L6.463 12l6.269 6.269a1.034 1.034 0 1 1-1.463 1.463l-7-7a1.034 1.034 0 0 1 0-1.463z"
    />
  </svg>
);
export default SvgArrowLeft;
