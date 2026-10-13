import type { SVGProps } from "react";
import * as React from "react";

const SvgGl = (props: SVGProps<SVGSVGElement>) => (
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
      d="M0 10C0 4.477 4.477 0 10 0s10 4.477 10 10c-.435 0-10 1.304-10 1.304z"
    />
    <path fill="#D80027" d="M20 10c0 5.523-4.477 10-10 10S0 15.523 0 10" />
    <path
      fill="#F0F0F0"
      d="M6.956 14.783a4.783 4.783 0 1 0 0-9.566 4.783 4.783 0 0 0 0 9.566"
    />
    <path fill="#D80027" d="M2.174 10a4.783 4.783 0 0 1 9.565 0" />
  </svg>
);
export default SvgGl;
