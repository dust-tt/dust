import type { SVGProps } from "react";
import * as React from "react";

const SvgMoonEclipse = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#moon-eclipse_svg__a)">
      <path
        fill="currentColor"
        d="M5.965 12c0-3.906 2.233-7.29 5.491-8.947a8.964 8.964 0 0 0 0 17.893A10.03 10.03 0 0 1 5.965 12M19.38 5.173a1.035 1.035 0 0 1 1.45.205 11.04 11.04 0 0 1-.003 13.246 1.035 1.035 0 1 1-1.654-1.244 8.97 8.97 0 0 0 .002-10.758 1.035 1.035 0 0 1 .205-1.45M8.035 12a7.965 7.965 0 0 0 8.302 7.958 1.036 1.036 0 0 1 .497 1.964A11 11 0 0 1 12 23.035C5.906 23.035.965 18.095.965 12S5.905.965 12 .965c1.732 0 3.373.4 4.834 1.113a1.035 1.035 0 0 1-.497 1.964A7.965 7.965 0 0 0 8.035 12"
      />
    </g>
    <defs>
      <clipPath id="moon-eclipse_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgMoonEclipse;
