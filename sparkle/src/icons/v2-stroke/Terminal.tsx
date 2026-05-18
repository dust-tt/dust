import type { SVGProps } from "react";
import * as React from "react";

const SvgTerminal = (props: SVGProps<SVGSVGElement>) => (
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
      d="M20 17.965a1.035 1.035 0 0 1 0 2.07h-8a1.035 1.035 0 0 1 0-2.07zM3.269 4.268a1.034 1.034 0 0 1 1.462 0l6 6a1.034 1.034 0 0 1 0 1.463l-6 6a1.034 1.034 0 1 1-1.462-1.463L8.537 11 3.27 5.73a1.034 1.034 0 0 1 0-1.463"
    />
  </svg>
);
export default SvgTerminal;
