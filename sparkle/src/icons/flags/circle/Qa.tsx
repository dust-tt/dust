import type { SVGProps } from "react";
import * as React from "react";

const SvgQa = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#F0F0F0"
      d="M10 20c5.523 0 10-4.477 10-10S15.523 0 10 0 0 4.477 0 10s4.477 10 10 10"
    />
    <path
      fill="#751A46"
      d="M20 10c0-5.523-4.478-10-10-10a9.95 9.95 0 0 0-5.323 1.533l2.192.932L3.912 3.72 6.87 4.977 3.912 6.233 6.87 7.489 3.912 8.745 6.87 10l-2.957 1.256 2.957 1.256-2.957 1.256 2.957 1.256-2.957 1.256 2.957 1.256-2.191.93A9.95 9.95 0 0 0 9.999 20c5.523 0 10-4.477 10-10"
    />
  </svg>
);
export default SvgQa;
