import type { SVGProps } from "react";
import * as React from "react";

const SvgReverseLeft = (props: SVGProps<SVGSVGElement>) => (
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
      d="M18.965 13A4.965 4.965 0 0 0 14 8.035H4a1.035 1.035 0 0 1 0-2.07h10a7.035 7.035 0 0 1 0 14.07H4a1.035 1.035 0 0 1 0-2.07h10A4.965 4.965 0 0 0 18.965 13"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M7.269 2.268a1.034 1.034 0 1 1 1.463 1.463L5.463 7l3.269 3.268a1.034 1.034 0 1 1-1.463 1.463l-4-4a1.034 1.034 0 0 1 0-1.463z"
    />
  </svg>
);
export default SvgReverseLeft;
