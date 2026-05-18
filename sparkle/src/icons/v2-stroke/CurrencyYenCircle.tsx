import type { SVGProps } from "react";
import * as React from "react";

const SvgCurrencyYenCircle = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#currency-yen-circle_svg__a)">
      <path
        fill="currentColor"
        d="M20.965 12a8.965 8.965 0 1 0-17.93 0A8.965 8.965 0 0 0 12 20.965 8.965 8.965 0 0 0 20.965 12m-10 6v-1.965H8.5a1.035 1.035 0 0 1 0-2.07h2.465v-.93H8a1.035 1.035 0 0 1 0-2.07h1.846L7.19 7.646A1.036 1.036 0 0 1 8.81 6.354L12 10.343l3.191-3.99a1.036 1.036 0 0 1 1.618 1.293l-2.655 3.319H16a1.035 1.035 0 0 1 0 2.07h-2.965v.93H15.5a1.035 1.035 0 0 1 0 2.07h-2.465V18a1.035 1.035 0 0 1-2.07 0m12.07-6c0 6.095-4.94 11.035-11.035 11.035S.965 18.095.965 12 5.905.965 12 .965 23.035 5.905 23.035 12"
      />
    </g>
    <defs>
      <clipPath id="currency-yen-circle_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgCurrencyYenCircle;
