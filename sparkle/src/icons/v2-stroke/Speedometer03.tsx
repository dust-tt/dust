import type { SVGProps } from "react";
import * as React from "react";

const SvgSpeedometer03 = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#speedometer-03_svg__a)">
      <path
        fill="currentColor"
        d="M20.965 12a8.965 8.965 0 1 0-17.93 0A8.965 8.965 0 0 0 12 20.965 8.965 8.965 0 0 0 20.965 12m-5.197-5.231A1.035 1.035 0 0 1 17.23 8.23l-3.262 3.262a2.035 2.035 0 1 1-1.464-1.463zM3.965 12A8.035 8.035 0 0 1 12 3.965a1.035 1.035 0 0 1 0 2.07A5.965 5.965 0 0 0 6.035 12a1.035 1.035 0 0 1-2.07 0m19.07 0c0 6.095-4.94 11.035-11.035 11.035S.965 18.095.965 12 5.905.965 12 .965 23.035 5.905 23.035 12"
      />
    </g>
    <defs>
      <clipPath id="speedometer-03_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgSpeedometer03;
