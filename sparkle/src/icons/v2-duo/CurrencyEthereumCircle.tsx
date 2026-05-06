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
    <g fill="currentColor" clipPath="url(#currency-ethereum-circle_svg__a)">
      <path
        d="M20.965 12a8.965 8.965 0 1 0-17.93 0A8.965 8.965 0 0 0 12 20.965 8.965 8.965 0 0 0 20.965 12m2.07 0c0 6.095-4.94 11.035-11.035 11.035S.965 18.095.965 12 5.905.965 12 .965 23.035 5.905 23.035 12"
        opacity={0.34}
      />
      <path d="M17.072 14.558a1.036 1.036 0 0 1 .857 1.884l-5.5 2.5a1.04 1.04 0 0 1-.857 0l-5.5-2.5a1.036 1.036 0 0 1 .857-1.884L12 16.862zM12 3.965c.305 0 .594.134.79.366l5.5 6.5a1.036 1.036 0 0 1-.361 1.611l-5.5 2.5a1.04 1.04 0 0 1-.857 0l-5.5-2.5a1.036 1.036 0 0 1-.362-1.61l5.5-6.501.078-.082c.191-.181.446-.284.712-.284m-3.826 7.158L12 12.863l3.825-1.74L12 6.603z" />
    </g>
    <defs>
      <clipPath id="currency-ethereum-circle_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgCurrencyEthereumCircle;
