import type { SVGProps } from "react";
import * as React from "react";

const SvgBj = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#D80027"
      d="m6.521 9.13.87 10.526A10 10 0 0 0 10 20c5.523 0 10-4.477 10-10z"
    />
    <path
      fill="#FFDA44"
      d="m6.521 10 .87-9.656A10 10 0 0 1 10 0c5.523 0 10 4.477 10 10z"
    />
    <path
      fill="#6DA544"
      d="M0 10c0 4.62 3.134 8.508 7.391 9.656V.343C3.134 1.492 0 5.38 0 10"
    />
  </svg>
);
export default SvgBj;
