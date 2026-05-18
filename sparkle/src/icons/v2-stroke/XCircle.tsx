import type { SVGProps } from "react";
import * as React from "react";

const SvgXCircle = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#x-circle_svg__a)">
      <path
        fill="currentColor"
        d="M20.965 12a8.965 8.965 0 1 0-17.93 0A8.965 8.965 0 0 0 12 20.965 8.965 8.965 0 0 0 20.965 12m-6.696-3.731A1.034 1.034 0 1 1 15.73 9.73L13.463 12l2.268 2.269a1.034 1.034 0 1 1-1.462 1.462L12 13.463 9.731 15.73A1.034 1.034 0 1 1 8.27 14.27L10.537 12 8.27 9.731A1.034 1.034 0 1 1 9.73 8.27L12 10.537zM23.035 12c0 6.095-4.94 11.035-11.035 11.035S.965 18.095.965 12 5.905.965 12 .965 23.035 5.905 23.035 12"
      />
    </g>
    <defs>
      <clipPath id="x-circle_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgXCircle;
