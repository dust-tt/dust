import type { SVGProps } from "react";
import * as React from "react";

const SvgCo = (props: SVGProps<SVGSVGElement>) => (
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
      d="M0 10C0 4.477 4.477 0 10 0s10 4.477 10 10l-10 .87z"
    />
    <path
      fill="#D80027"
      d="M1.338 15c1.729 2.989 4.96 5 8.662 5a10 10 0 0 0 8.662-5L10 14.348z"
    />
    <path
      fill="#0052B4"
      d="M18.662 15A9.96 9.96 0 0 0 20 10H0c0 1.822.487 3.53 1.338 5z"
    />
  </svg>
);
export default SvgCo;
