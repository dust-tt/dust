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
      d="M16.269 6.268a1.034 1.034 0 1 1 1.462 1.463l-10 10a1.034 1.034 0 1 1-1.463-1.463z"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M5.965 7a1.035 1.035 0 0 1 2.07 0v8.965H17a1.035 1.035 0 0 1 0 2.07H7A1.035 1.035 0 0 1 5.965 17z"
    />
  </svg>
);
export default SvgArrowDownLeft;
