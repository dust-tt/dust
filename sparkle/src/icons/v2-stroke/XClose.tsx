import type { SVGProps } from "react";
import * as React from "react";

const SvgXClose = (props: SVGProps<SVGSVGElement>) => (
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
      d="M17.269 5.268a1.034 1.034 0 1 1 1.462 1.463L13.463 12l5.268 5.268a1.034 1.034 0 1 1-1.463 1.463L12 13.463 6.731 18.73a1.034 1.034 0 1 1-1.462-1.463L10.537 12 5.27 6.73A1.034 1.034 0 1 1 6.73 5.268L12 10.537z"
    />
  </svg>
);
export default SvgXClose;
