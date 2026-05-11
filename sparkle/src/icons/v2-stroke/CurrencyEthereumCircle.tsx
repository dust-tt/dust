import type { SVGProps } from "react";
import * as React from "react";

const SvgCurrencyEthereumCircle = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#currency-ethereum-circle_svg__a)">
      <path
        fill="currentColor"
        d="M20.965 12a8.965 8.965 0 1 0-17.93 0A8.965 8.965 0 0 0 12 20.965 8.965 8.965 0 0 0 20.965 12m-3.894 2.558a1.036 1.036 0 0 1 .858 1.884l-5.5 2.5a1.04 1.04 0 0 1-.857 0l-5.5-2.5a1.036 1.036 0 0 1 .857-1.884L12 16.862zM12 3.965c.304 0 .593.134.79.366l5.5 6.5a1.036 1.036 0 0 1-.361 1.611l-5.5 2.5a1.04 1.04 0 0 1-.857 0l-5.5-2.5a1.036 1.036 0 0 1-.362-1.61l5.5-6.501c.197-.232.486-.366.79-.366m-3.826 7.158L12 12.863l3.825-1.74L12 6.603zM23.035 12c0 6.095-4.94 11.035-11.035 11.035S.965 18.095.965 12 5.905.965 12 .965 23.035 5.905 23.035 12"
      />
    </g>
    <defs>
      <clipPath id="currency-ethereum-circle_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgCurrencyEthereumCircle;
