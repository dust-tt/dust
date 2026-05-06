import type { SVGProps } from "react";
import * as React from "react";

const SvgArrowCircleUpLeft = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g fill="currentColor" clipPath="url(#arrow-circle-up-left_svg__a)">
      <path
        d="M20.965 12a8.965 8.965 0 1 0-17.93 0A8.965 8.965 0 0 0 12 20.965 8.965 8.965 0 0 0 20.965 12m2.07 0c0 6.095-4.94 11.035-11.035 11.035S.965 18.095.965 12 5.905.965 12 .965 23.035 5.905 23.035 12"
        opacity={0.4}
      />
      <path d="M7.965 15V9c0-.572.463-1.035 1.035-1.035h6a1.035 1.035 0 0 1 0 2.07h-3.502l4.233 4.233a1.035 1.035 0 0 1-1.462 1.463l-4.234-4.233V15a1.035 1.035 0 0 1-2.07 0" />
    </g>
    <defs>
      <clipPath id="arrow-circle-up-left_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgArrowCircleUpLeft;
