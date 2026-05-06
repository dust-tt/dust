import type { SVGProps } from "react";
import * as React from "react";

const SvgLifeBuoy01 = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g fill="currentColor" clipPath="url(#life-buoy-01_svg__a)">
      <path
        d="M8.436 14.1A1.035 1.035 0 0 1 9.9 15.564l-4.24 4.239a1.035 1.035 0 1 1-1.462-1.464zm5.693.032a1.035 1.035 0 0 1 1.464 0l4.207 4.207a1.035 1.035 0 0 1-1.464 1.464l-4.207-4.207a1.035 1.035 0 0 1 0-1.464m4.207-9.935A1.035 1.035 0 0 1 19.8 5.66L15.561 9.9a1.035 1.035 0 0 1-1.464-1.463zm-14.138 0a1.034 1.034 0 0 1 1.463 0l4.208 4.207a1.035 1.035 0 0 1-1.464 1.464L4.198 5.66a1.034 1.034 0 0 1 0-1.463"
        opacity={0.4}
      />
      <path d="M20.965 12a8.965 8.965 0 1 0-17.93 0A8.965 8.965 0 0 0 12 20.965 8.965 8.965 0 0 0 20.965 12m-6 0a2.965 2.965 0 1 0-5.93 0 2.965 2.965 0 0 0 5.93 0m2.07 0a5.035 5.035 0 1 1-10.07 0 5.035 5.035 0 0 1 10.07 0m6 0c0 6.095-4.94 11.035-11.035 11.035S.965 18.095.965 12 5.905.965 12 .965 23.035 5.905 23.035 12" />
    </g>
    <defs>
      <clipPath id="life-buoy-01_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgLifeBuoy01;
