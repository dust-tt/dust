import type { SVGProps } from "react";
import * as React from "react";

const SvgArrowDownLeft = (props: SVGProps<SVGSVGElement>) => (
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
      d="M16.269 6.269A1.034 1.034 0 1 1 17.73 7.73l-8.233 8.234H17a1.035 1.035 0 0 1 0 2.07H7A1.035 1.035 0 0 1 5.965 17V7a1.035 1.035 0 0 1 2.07 0v7.502z"
    />
  </svg>
);
export default SvgArrowDownLeft;
