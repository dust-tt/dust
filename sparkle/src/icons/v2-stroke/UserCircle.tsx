import type { SVGProps } from "react";
import * as React from "react";

const SvgUserCircle = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#user-circle_svg__a)">
      <path
        fill="currentColor"
        d="M20.965 12a8.965 8.965 0 1 0-15.826 5.769A5.02 5.02 0 0 1 9 15.965h6c1.552 0 2.937.702 3.86 1.804A8.93 8.93 0 0 0 20.965 12M9 18.035a2.96 2.96 0 0 0-2.35 1.158A8.92 8.92 0 0 0 12 20.965a8.92 8.92 0 0 0 5.35-1.772A2.96 2.96 0 0 0 15 18.035zM14.965 9.5a2.965 2.965 0 1 0-5.93 0 2.965 2.965 0 0 0 5.93 0m8.07 2.5a11 11 0 0 1-3.706 8.246A11 11 0 0 1 12 23.036a11 11 0 0 1-7.39-2.843A11 11 0 0 1 .964 12C.965 5.906 5.905.965 12 .965S23.035 5.905 23.035 12m-6-2.5a5.035 5.035 0 1 1-10.07 0 5.035 5.035 0 0 1 10.07 0"
      />
    </g>
    <defs>
      <clipPath id="user-circle_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgUserCircle;
