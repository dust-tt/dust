import type { SVGProps } from "react";
import * as React from "react";

const SvgCheckDouble = (props: SVGProps<SVGSVGElement>) => (
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
      d="M19.269 9.144a1.035 1.035 0 1 1 1.463 1.463l-6 6a1.035 1.035 0 0 1-1.463 0l-1.5-1.5a1.035 1.035 0 0 1 1.463-1.463l.768.768zm-7-.875a1.034 1.034 0 1 1 1.463 1.462l-6 6a1.034 1.034 0 0 1-1.463 0l-3-3A1.034 1.034 0 1 1 4.73 11.27L7 13.537z"
    />
  </svg>
);
export default SvgCheckDouble;
