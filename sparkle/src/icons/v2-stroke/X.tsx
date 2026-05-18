import type { SVGProps } from "react";
import * as React from "react";

const SvgX = (props: SVGProps<SVGSVGElement>) => (
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
      d="M16.269 6.268a1.034 1.034 0 1 1 1.462 1.463L13.463 12l4.268 4.268a1.034 1.034 0 1 1-1.463 1.463L12 13.463 7.731 17.73a1.034 1.034 0 1 1-1.462-1.463L10.537 12 6.27 7.73A1.034 1.034 0 1 1 7.73 6.268L12 10.537z"
    />
  </svg>
);
export default SvgX;
