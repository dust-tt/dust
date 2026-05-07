import type { SVGProps } from "react";
import * as React from "react";

const SvgArrowCircleBrokenDown = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#arrow-circle-broken-down_svg__a)">
      <path
        fill="currentColor"
        d="M.965 12A11.03 11.03 0 0 1 6.48 2.442 1.035 1.035 0 0 1 7.52 4.233 8.965 8.965 0 0 0 12 20.964a8.965 8.965 0 0 0 4.481-16.73 1.035 1.035 0 0 1 1.038-1.792A11.03 11.03 0 0 1 23.035 12c0 6.095-4.94 11.035-11.035 11.035S.965 18.095.965 12m10-10a1.035 1.035 0 0 1 2.07 0v11.502l2.234-2.233a1.034 1.034 0 1 1 1.462 1.462l-4 4a1.034 1.034 0 0 1-1.462 0l-4-4A1.034 1.034 0 1 1 8.73 11.27l2.234 2.233z"
      />
    </g>
    <defs>
      <clipPath id="arrow-circle-broken-down_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgArrowCircleBrokenDown;
