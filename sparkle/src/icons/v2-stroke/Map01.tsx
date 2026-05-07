import type { SVGProps } from "react";
import * as React from "react";

const SvgMap01 = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#map-01_svg__a)">
      <path
        fill="currentColor"
        d="M8.486 1.102c.319-.182.71-.182 1.028 0l6.443 3.681 5.469-3.644a1.035 1.035 0 0 1 1.61.861v16c0 .346-.174.67-.462.861l-6 4a1.04 1.04 0 0 1-1.088.038L9 19.192l-6.486 3.707A1.036 1.036 0 0 1 .964 22V6c0-.371.2-.714.522-.898zM3.036 6.6v13.616L7.964 17.4V3.783zm7 10.8 4.929 2.816V6.6l-4.93-2.817zm7-10.846v13.512l3.929-2.62V3.933z"
      />
    </g>
    <defs>
      <clipPath id="map-01_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgMap01;
