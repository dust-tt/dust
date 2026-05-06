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
    <g clipPath="url(#circle-cut_svg__a)">
      <path
        fill="currentColor"
        d="M10.965 12A8.96 8.96 0 0 0 7 4.558 8.96 8.96 0 0 0 3.035 12c0 3.1 1.574 5.831 3.965 7.441A8.96 8.96 0 0 0 10.965 12m2.07 0c0 3.406-1.544 6.448-3.967 8.472A8.965 8.965 0 0 0 20.964 12 8.965 8.965 0 0 0 9.069 3.527 11.01 11.01 0 0 1 13.035 12m10 0c0 6.095-4.94 11.035-11.035 11.035a11 11 0 0 1-5.448-1.44A11.028 11.028 0 0 1 .965 12a11.03 11.03 0 0 1 5.587-9.596A11 11 0 0 1 12 .964C18.095.965 23.035 5.907 23.035 12"
      />
    </g>
    <defs>
      <clipPath id="circle-cut_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgCircleCut;
