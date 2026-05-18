import type { SVGProps } from "react";
import * as React from "react";

const SvgDisc02 = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#disc-02_svg__a)">
      <path
        fill="currentColor"
        d="M20.965 12a8.965 8.965 0 1 0-17.93 0A8.965 8.965 0 0 0 12 20.965 8.965 8.965 0 0 0 20.965 12m-17 0a1.035 1.035 0 0 1 2.07 0 5.96 5.96 0 0 0 2.892 5.113 1.035 1.035 0 0 1-1.069 1.774A8.03 8.03 0 0 1 3.965 12m10 0a1.965 1.965 0 1 0-3.93 0 1.965 1.965 0 0 0 3.93 0m4 0a5.97 5.97 0 0 0-3.41-5.392 1.035 1.035 0 0 1 .89-1.87A8.04 8.04 0 0 1 20.034 12a1.035 1.035 0 0 1-2.07 0m-1.93 0a4.035 4.035 0 1 1-8.07 0 4.035 4.035 0 0 1 8.07 0m7 0c0 6.095-4.94 11.035-11.035 11.035S.965 18.095.965 12 5.905.965 12 .965 23.035 5.905 23.035 12"
      />
    </g>
    <defs>
      <clipPath id="disc-02_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgDisc02;
