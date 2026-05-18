import type { SVGProps } from "react";
import * as React from "react";

const SvgClockPlus = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#clock-plus_svg__a)">
      <path
        fill="currentColor"
        d="M17.965 22v-1.965H16a1.035 1.035 0 0 1 0-2.07h1.965V16a1.035 1.035 0 0 1 2.07 0v1.965H22a1.035 1.035 0 0 1 0 2.07h-1.965V22a1.035 1.035 0 0 1-2.07 0m-7-16a1.035 1.035 0 0 1 2.07 0v5.36l3.166 1.583a1.035 1.035 0 0 1-.926 1.852l-3.738-1.87a1.03 1.03 0 0 1-.572-.925zm10 6a8.965 8.965 0 1 0-17.93 0 8.965 8.965 0 0 0 10.118 8.892 1.035 1.035 0 0 1 .264 2.052q-.697.09-1.417.091C5.906 23.035.965 18.095.965 12S5.905.965 12 .965 23.035 5.905 23.035 12q0 .708-.088 1.395a1.035 1.035 0 0 1-2.053-.26q.07-.556.07-1.135"
      />
    </g>
    <defs>
      <clipPath id="clock-plus_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgClockPlus;
