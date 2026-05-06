import type { SVGProps } from "react";
import * as React from "react";

const SvgArrowCircleDownLeft = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#arrow-circle-down-left_svg__a)">
      <path
        fill="currentColor"
        d="M20.965 12a8.965 8.965 0 1 0-17.93 0A8.965 8.965 0 0 0 12 20.965 8.965 8.965 0 0 0 20.965 12m-6.696-3.731a1.035 1.035 0 0 1 1.463 1.462L11.5 13.965H15a1.035 1.035 0 0 1 0 2.07H9A1.035 1.035 0 0 1 7.965 15V9a1.035 1.035 0 0 1 2.07 0v3.502zM23.035 12c0 6.095-4.94 11.035-11.035 11.035S.965 18.095.965 12 5.905.965 12 .965 23.035 5.905 23.035 12"
      />
    </g>
    <defs>
      <clipPath id="arrow-circle-down-left_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgArrowCircleDownLeft;
