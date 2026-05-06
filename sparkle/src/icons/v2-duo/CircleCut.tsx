import type { SVGProps } from "react";
import * as React from "react";

const SvgCircleCut = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g fill="currentColor" clipPath="url(#circle-cut_svg__a)">
      <path
        d="M20.965 12a8.965 8.965 0 1 0-17.93 0A8.965 8.965 0 0 0 12 20.965 8.965 8.965 0 0 0 20.965 12m2.07 0c0 6.095-4.94 11.035-11.035 11.035S.965 18.095.965 12 5.905.965 12 .965 23.035 5.905 23.035 12"
        opacity={0.4}
      />
      <path d="M10.965 12A8.96 8.96 0 0 0 7 4.558 8.96 8.96 0 0 0 3.035 12 8.95 8.95 0 0 0 7 19.44 8.95 8.95 0 0 0 10.965 12m2.07 0c0 4.086-2.22 7.652-5.516 9.558-.321.186-.717.186-1.038 0A11.03 11.03 0 0 1 .965 12c0-4.086 2.221-7.651 5.516-9.558.321-.185.717-.185 1.038 0A11.03 11.03 0 0 1 13.035 12" />
    </g>
    <defs>
      <clipPath id="circle-cut_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgCircleCut;
