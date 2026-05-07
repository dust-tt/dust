import type { SVGProps } from "react";
import * as React from "react";

const SvgThermometerCold = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#thermometer-cold_svg__a)">
      <path
        fill="currentColor"
        d="M18.965 4a.965.965 0 1 0-1.93 0v10.535c0 .37-.197.71-.516.896a2.965 2.965 0 1 0 2.963 0 1.03 1.03 0 0 1-.517-.896zm-11 16v-2.502L6.73 18.731A1.034 1.034 0 1 1 5.27 17.27l2.696-2.697v-1.537H6.428L3.73 15.731A1.034 1.034 0 1 1 2.27 14.27l1.233-1.234H2a1.035 1.035 0 0 1 0-2.07h1.502L2.269 9.73A1.034 1.034 0 1 1 3.73 8.27l2.697 2.696h1.537V9.428L5.269 6.73A1.034 1.034 0 1 1 6.73 5.27l1.234 1.233V4a1.035 1.035 0 0 1 2.07 0v2.502l1.234-1.233A1.034 1.034 0 1 1 12.73 6.73l-2.696 2.697v1.537H12a1.035 1.035 0 0 1 0 2.07h-1.965v1.537l1.196 1.197a1.034 1.034 0 0 1-1.196 1.655V20a1.035 1.035 0 0 1-2.07 0m13.07-6.017a5.035 5.035 0 1 1-6.07 0V4a3.035 3.035 0 0 1 6.07 0z"
      />
    </g>
    <defs>
      <clipPath id="thermometer-cold_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgThermometerCold;
