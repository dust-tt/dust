import type { SVGProps } from "react";
import * as React from "react";

const SvgCurrencyDollarCircle = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#currency-dollar-circle_svg__a)">
      <path
        fill="currentColor"
        d="M20.965 12a8.965 8.965 0 1 0-17.93 0A8.965 8.965 0 0 0 12 20.965 8.965 8.965 0 0 0 20.965 12m-6.5-2.667c0-.717-.581-1.298-1.298-1.298H11a1.465 1.465 0 1 0 0 2.93h2a3.535 3.535 0 0 1 .035 7.07v.465a1.035 1.035 0 0 1-2.07 0v-.465h-.132a3.37 3.37 0 0 1-3.368-3.368 1.035 1.035 0 0 1 2.07 0c0 .717.581 1.298 1.298 1.298H13a1.465 1.465 0 1 0 0-2.93h-2a3.535 3.535 0 0 1-.035-7.07V5.5a1.035 1.035 0 0 1 2.07 0v.465h.132a3.37 3.37 0 0 1 3.368 3.368 1.035 1.035 0 0 1-2.07 0M23.035 12c0 6.095-4.94 11.035-11.035 11.035S.965 18.095.965 12 5.905.965 12 .965 23.035 5.905 23.035 12"
      />
    </g>
    <defs>
      <clipPath id="currency-dollar-circle_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgCurrencyDollarCircle;
