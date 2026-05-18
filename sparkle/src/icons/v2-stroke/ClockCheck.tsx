import type { SVGProps } from "react";
import * as React from "react";

const SvgClockCheck = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#clock-check_svg__a)">
      <path
        fill="currentColor"
        d="M20.269 15.769a1.034 1.034 0 1 1 1.462 1.462l-4.5 4.5a1.034 1.034 0 0 1-1.462 0l-2-2a1.034 1.034 0 1 1 1.462-1.462l1.269 1.268zM10.965 6a1.035 1.035 0 0 1 2.07 0v5.36l3.166 1.583a1.035 1.035 0 0 1-.926 1.852l-3.738-1.87a1.03 1.03 0 0 1-.572-.925zm10 6a8.965 8.965 0 1 0-17.93 0 8.965 8.965 0 0 0 8.73 8.962 1.036 1.036 0 0 1-.053 2.07C5.75 22.877.965 17.997.965 12 .965 5.906 5.905.965 12 .965S23.035 5.905 23.035 12q0 .305-.016.605a1.035 1.035 0 0 1-2.068-.11 9 9 0 0 0 .014-.495"
      />
    </g>
    <defs>
      <clipPath id="clock-check_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgClockCheck;
