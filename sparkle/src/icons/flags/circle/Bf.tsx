import type { SVGProps } from "react";
import * as React from "react";

const SvgBf = (props: SVGProps<SVGSVGElement>) => (
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
      d="M0 10C0 4.477 4.477 0 10 0s10 4.477 10 10c-.435 0-10 1.304-10 1.304z"
    />
    <path fill="#6DA544" d="M20 10c0 5.523-4.477 10-10 10S0 15.523 0 10" />
    <path
      fill="#FFDA44"
      d="m10 6.522.756 2.325h2.445l-1.978 1.437.756 2.325L10 11.172l-1.978 1.437.756-2.325L6.8 8.847h2.444z"
    />
  </svg>
);
export default SvgBf;
