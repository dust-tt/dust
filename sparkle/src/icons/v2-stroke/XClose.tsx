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
      d="M17.269 5.269A1.034 1.034 0 1 1 18.73 6.73L13.463 12l5.268 5.269a1.034 1.034 0 1 1-1.462 1.463L12 13.462l-5.269 5.27a1.034 1.034 0 1 1-1.462-1.463L10.537 12 5.27 6.731A1.034 1.034 0 1 1 6.73 5.27L12 10.537z"
    />
  </svg>
);
export default SvgXClose;
