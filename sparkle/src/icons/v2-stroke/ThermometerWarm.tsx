import type { SVGProps } from "react";
import * as React from "react";

const SvgThermometerWarm = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#thermometer-warm_svg__a)">
      <path
        fill="currentColor"
        d="M18.965 4a.965.965 0 1 0-1.93 0v10.535c0 .37-.197.71-.516.896a2.965 2.965 0 1 0 2.963 0 1.03 1.03 0 0 1-.517-.896zM5.868 17.668a1.035 1.035 0 0 1 1.464 1.464l-1.4 1.4a1.036 1.036 0 0 1-1.464-1.464zm6.149-9.703a1.036 1.036 0 0 1-.034 2.07 2.965 2.965 0 0 0-1.482 5.56 1.035 1.035 0 0 1-1.002 1.81 5.036 5.036 0 0 1 2.518-9.44m-8.017 4a1.035 1.035 0 0 1 0 2.07H2a1.035 1.035 0 0 1 0-2.07zm.468-6.497a1.036 1.036 0 0 1 1.464 0l1.4 1.4a1.035 1.035 0 0 1-1.464 1.464l-1.4-1.4a1.036 1.036 0 0 1 0-1.464M10.965 5V3a1.035 1.035 0 0 1 2.07 0v2a1.035 1.035 0 0 1-2.07 0m10.07 8.983a5.035 5.035 0 1 1-6.07 0V4a3.035 3.035 0 0 1 6.07 0z"
      />
    </g>
    <defs>
      <clipPath id="thermometer-warm_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgThermometerWarm;
