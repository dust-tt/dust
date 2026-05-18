import type { SVGProps } from "react";
import * as React from "react";

const SvgArrowCircleBrokenUp = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#arrow-circle-broken-up_svg__a)">
      <path
        fill="currentColor"
        d="M10.965 22V10.498L8.73 12.73a1.034 1.034 0 1 1-1.462-1.463l4-4 .078-.07a1.035 1.035 0 0 1 1.384.07l4 4a1.034 1.034 0 1 1-1.462 1.463l-2.234-2.233V22a1.035 1.035 0 0 1-2.07 0m10-10a8.965 8.965 0 1 0-17.93 0 8.96 8.96 0 0 0 4.484 7.767 1.035 1.035 0 0 1-1.038 1.79A11.03 11.03 0 0 1 .965 12C.965 5.905 5.905.965 12 .965S23.035 5.905 23.035 12c0 4.085-2.221 7.651-5.516 9.558a1.035 1.035 0 0 1-1.038-1.791A8.96 8.96 0 0 0 20.965 12"
      />
    </g>
    <defs>
      <clipPath id="arrow-circle-broken-up_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgArrowCircleBrokenUp;
