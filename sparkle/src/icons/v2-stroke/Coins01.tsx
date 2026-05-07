import type { SVGProps } from "react";
import * as React from "react";

const SvgCoins01 = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#coins-01_svg__a)">
      <path
        fill="currentColor"
        d="M20.965 9A5.965 5.965 0 0 0 9.389 6.975a8.034 8.034 0 0 1 7.635 7.635A5.97 5.97 0 0 0 20.964 9m-17.93 6a5.965 5.965 0 1 0 11.93 0 5.965 5.965 0 0 0-11.93 0m20-6a8.036 8.036 0 0 1-6.21 7.825A8.036 8.036 0 0 1 .964 15a8.04 8.04 0 0 1 6.209-7.825A8.035 8.035 0 0 1 23.035 9"
      />
    </g>
    <defs>
      <clipPath id="coins-01_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgCoins01;
