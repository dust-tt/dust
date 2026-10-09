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
      d="M18.965 13A4.965 4.965 0 0 0 14 8.035H6.498l2.233 2.234a1.034 1.034 0 1 1-1.462 1.463l-4-4a1.034 1.034 0 0 1 0-1.463l4-4A1.034 1.034 0 1 1 8.73 3.73L6.498 5.965H14a7.035 7.035 0 0 1 0 14.07H4a1.035 1.035 0 0 1 0-2.07h10A4.965 4.965 0 0 0 18.965 13"
    />
  </svg>
);
export default SvgReverseLeft;
