import type { SVGProps } from "react";
import * as React from "react";

const SvgEc = (props: SVGProps<SVGSVGElement>) => (
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
    <path
      fill="#FFDA44"
      d="M10 13.478a3.478 3.478 0 1 0 0-6.956 3.478 3.478 0 0 0 0 6.956"
    />
    <path
      fill="#338AF3"
      d="M10 12.174A2.176 2.176 0 0 1 7.826 10V8.696c0-1.199.975-2.174 2.174-2.174s2.174.975 2.174 2.174V10A2.176 2.176 0 0 1 10 12.174"
    />
    <path
      fill="#000"
      d="M13.478 4.783h-2.609a.87.87 0 1 0-1.739 0H6.521c0 .48.419.87.899.87h-.029c0 .48.39.869.87.869 0 .48.389.87.87.87h1.738c.48 0 .87-.39.87-.87.48 0 .87-.39.87-.87h-.03c.48 0 .899-.39.899-.87"
    />
  </svg>
);
export default SvgEc;
