import type { SVGProps } from "react";
import * as React from "react";

const SvgCurrencyEuroCircle = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#currency-euro-circle_svg__a)">
      <path
        fill="currentColor"
        d="M20.965 12a8.965 8.965 0 1 0-17.93 0A8.965 8.965 0 0 0 12 20.965 8.965 8.965 0 0 0 20.965 12m-15 0q.001-.235.02-.466A1.035 1.035 0 0 1 6 9.464h.523a6.035 6.035 0 0 1 9.5-1.962 1.036 1.036 0 0 1-1.38 1.542A3.95 3.95 0 0 0 12 8.035a3.96 3.96 0 0 0-3.049 1.43H11a1.035 1.035 0 0 1 0 2.07H8.063a4 4 0 0 0 0 .93H11a1.035 1.035 0 0 1 0 2.07H8.951A3.96 3.96 0 0 0 12 15.965c1.016 0 1.941-.38 2.644-1.009a1.035 1.035 0 1 1 1.38 1.542 6.035 6.035 0 0 1-9.5-1.963H6a1.035 1.035 0 0 1-.016-2.07 6 6 0 0 1-.02-.465m17.07 0c0 6.095-4.94 11.035-11.035 11.035S.965 18.095.965 12 5.905.965 12 .965 23.035 5.905 23.035 12"
      />
    </g>
    <defs>
      <clipPath id="currency-euro-circle_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgCurrencyEuroCircle;
