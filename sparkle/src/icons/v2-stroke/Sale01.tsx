import type { SVGProps } from "react";
import * as React from "react";

const SvgSale01 = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#sale-01_svg__a)">
      <path
        fill="currentColor"
        d="M20.965 12a8.965 8.965 0 1 0-17.93 0A8.965 8.965 0 0 0 12 20.965 8.965 8.965 0 0 0 20.965 12m-5.696-4.731A1.034 1.034 0 1 1 16.73 8.73l-8 8A1.034 1.034 0 1 1 7.27 15.27zM15 13.465a1.535 1.535 0 1 1 0 3.07 1.535 1.535 0 0 1 0-3.07m-6-6a1.535 1.535 0 1 1 0 3.07 1.535 1.535 0 0 1 0-3.07M23.035 12c0 6.095-4.94 11.035-11.035 11.035S.965 18.095.965 12 5.905.965 12 .965 23.035 5.905 23.035 12"
      />
    </g>
    <defs>
      <clipPath id="sale-01_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgSale01;
