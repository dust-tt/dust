import type { SVGProps } from "react";
import * as React from "react";

const SvgArrowCircleUpRight = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#arrow-circle-up-right_svg__a)">
      <path
        fill="currentColor"
        d="M20.965 12a8.965 8.965 0 1 0-17.93 0A8.965 8.965 0 0 0 12 20.965 8.965 8.965 0 0 0 20.965 12m2.07 0c0 6.095-4.94 11.035-11.035 11.035S.965 18.095.965 12 5.905.965 12 .965 23.035 5.905 23.035 12m-7 3a1.035 1.035 0 0 1-2.07 0v-3.501l-4.233 4.232A1.035 1.035 0 0 1 8.27 14.27l4.233-4.234H9a1.035 1.035 0 0 1 0-2.07h6c.572 0 1.035.463 1.035 1.035z"
      />
    </g>
    <defs>
      <clipPath id="arrow-circle-up-right_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgArrowCircleUpRight;
