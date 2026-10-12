import type { SVGProps } from "react";
import * as React from "react";

const SvgAw = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#FFDA44"
      d="M10 20c5.523 0 10-4.477 10-10S15.523 0 10 0 0 4.477 0 10s4.477 10 10 10"
    />
    <path
      fill="#338AF3"
      d="M10 20a9.98 9.98 0 0 0 7.58-3.478H2.42A9.98 9.98 0 0 0 10 20M20 10c0-5.523-4.477-10-10-10S0 4.477 0 10c0 .903.12 1.777.344 2.609h19.312A10 10 0 0 0 20 10M.795 13.913q.29.68.673 1.304h17.064q.383-.623.673-1.304z"
    />
    <path
      fill="#F0F0F0"
      d="m4.583 6.307-1.954-.862 1.954-.862.862-1.954.862 1.954 1.954.862-1.954.862-.862 1.954z"
    />
    <path
      fill="#D80027"
      d="m5.444 3.706.533 1.206 1.206.533-1.206.532-.533 1.207-.532-1.207-1.207-.532 1.207-.533z"
    />
  </svg>
);
export default SvgAw;
