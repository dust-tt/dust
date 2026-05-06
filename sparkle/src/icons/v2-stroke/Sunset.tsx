import type { SVGProps } from "react";
import * as React from "react";

const SvgSunset = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#sunset_svg__a)">
      <path
        fill="currentColor"
        d="M22 20.965a1.035 1.035 0 0 1 0 2.07H2a1.035 1.035 0 0 1 0-2.07zm-18-4a1.035 1.035 0 0 1 0 2.07H2a1.035 1.035 0 0 1 0-2.07zM15.965 18a3.965 3.965 0 1 0-7.93 0 1.035 1.035 0 0 1-2.07 0 6.035 6.035 0 0 1 12.07 0 1.035 1.035 0 0 1-2.07 0M22 16.965a1.035 1.035 0 0 1 0 2.07h-2a1.035 1.035 0 0 1 0-2.07zM4.168 10.168a1.035 1.035 0 0 1 1.464 0l1.414 1.414a1.035 1.035 0 0 1-1.464 1.464l-1.414-1.414a1.035 1.035 0 0 1 0-1.464m14.2 0a1.035 1.035 0 0 1 1.464 1.464l-1.414 1.414a1.035 1.035 0 0 1-1.464-1.464zM10.965 2a1.035 1.035 0 0 1 2.07 0v4.502l2.234-2.233A1.034 1.034 0 1 1 16.73 5.73l-4 4a1.034 1.034 0 0 1-1.462 0l-4-4A1.034 1.034 0 1 1 8.73 4.27l2.234 2.233z"
      />
    </g>
    <defs>
      <clipPath id="sunset_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgSunset;
