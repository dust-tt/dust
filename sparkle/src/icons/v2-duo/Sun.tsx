import type { SVGProps } from "react";
import * as React from "react";

const SvgSun = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g fill="currentColor" clipPath="url(#sun_svg__a)">
      <path
        d="M10.965 22v-2a1.035 1.035 0 0 1 2.07 0v2a1.035 1.035 0 0 1-2.07 0m-5.383-5.042a1.035 1.035 0 0 1 1.464 1.464l-1.414 1.414a1.035 1.035 0 0 1-1.464-1.464zm11.372 0a1.035 1.035 0 0 1 1.464 0l1.414 1.414a1.035 1.035 0 0 1-1.464 1.464l-1.414-1.414a1.035 1.035 0 0 1 0-1.464M4 10.965a1.035 1.035 0 0 1 0 2.07H2a1.035 1.035 0 0 1 0-2.07zm18 0a1.035 1.035 0 0 1 0 2.07h-2a1.035 1.035 0 0 1 0-2.07zM4.168 4.168a1.035 1.035 0 0 1 1.464 0l1.414 1.414a1.035 1.035 0 0 1-1.464 1.464L4.168 5.632a1.035 1.035 0 0 1 0-1.464m14.2 0a1.035 1.035 0 0 1 1.464 1.464l-1.414 1.414a1.035 1.035 0 0 1-1.464-1.464zM10.965 4V2a1.035 1.035 0 0 1 2.07 0v2a1.035 1.035 0 0 1-2.07 0"
        opacity={0.4}
      />
      <path d="M15.965 12a3.965 3.965 0 1 0-7.93 0 3.965 3.965 0 0 0 7.93 0m2.07 0a6.035 6.035 0 1 1-12.07 0 6.035 6.035 0 0 1 12.07 0" />
    </g>
    <defs>
      <clipPath id="sun_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgSun;
