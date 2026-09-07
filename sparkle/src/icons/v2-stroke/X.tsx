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
      d="M16.269 6.269A1.034 1.034 0 1 1 17.73 7.73L13.463 12l4.268 4.269a1.034 1.034 0 1 1-1.463 1.463L12 13.462l-4.269 4.27a1.034 1.034 0 1 1-1.462-1.463L10.537 12 6.27 7.731A1.034 1.034 0 1 1 7.73 6.27L12 10.537z"
    />
  </svg>
);
export default SvgX;
