import type { SVGProps } from "react";
import * as React from "react";

const SvgArrowCircleBrokenLeft = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g fill="currentColor" clipPath="url(#arrow-circle-broken-left_svg__a)">
      <path
        d="M.965 12C.965 5.906 5.905.965 12 .965a11.03 11.03 0 0 1 9.558 5.516 1.035 1.035 0 0 1-1.791 1.038A8.965 8.965 0 1 0 12 20.965a8.96 8.96 0 0 0 7.767-4.484 1.035 1.035 0 0 1 1.79 1.038A11.03 11.03 0 0 1 12 23.035C5.906 23.035.965 18.095.965 12"
        opacity={0.4}
      />
      <path d="M11.269 7.268a1.034 1.034 0 1 1 1.462 1.463l-2.233 2.234H22a1.035 1.035 0 0 1 0 2.07H10.498l2.233 2.233a1.034 1.034 0 1 1-1.463 1.463l-4-4a1.034 1.034 0 0 1 0-1.463z" />
    </g>
    <defs>
      <clipPath id="arrow-circle-broken-left_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgArrowCircleBrokenLeft;
