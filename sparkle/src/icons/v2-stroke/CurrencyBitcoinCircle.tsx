import type { SVGProps } from "react";
import * as React from "react";

const SvgCurrencyBitcoinCircle = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#currency-bitcoin-circle_svg__a)">
      <path
        fill="currentColor"
        d="M20.965 12a8.965 8.965 0 1 0-17.93 0A8.965 8.965 0 0 0 12 20.965 8.965 8.965 0 0 0 20.965 12m-5.5 2.25c0-.671-.544-1.215-1.215-1.215h-3.715v2.43h3.715c.671 0 1.215-.544 1.215-1.215m-.5-4.5c0-.671-.544-1.215-1.215-1.215h-3.215v2.43h3.215c.671 0 1.215-.544 1.215-1.215m8.07 2.25c0 6.095-4.94 11.035-11.035 11.035S.965 18.095.965 12 5.905.965 12 .965 23.035 5.905 23.035 12m-6-2.25a3.27 3.27 0 0 1-.67 1.987 3.285 3.285 0 0 1-2.115 5.798h-.215V18a1.035 1.035 0 0 1-2.07 0v-.465h-.93V18a1.035 1.035 0 0 1-2.07 0v-.465H8a1.035 1.035 0 0 1 0-2.07h.465v-6.93H8a1.035 1.035 0 0 1 0-2.07h.965V6a1.035 1.035 0 0 1 2.07 0v.465h.93V6a1.035 1.035 0 0 1 2.07 0v.479c1.68.144 3 1.553 3 3.271"
      />
    </g>
    <defs>
      <clipPath id="currency-bitcoin-circle_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgCurrencyBitcoinCircle;
