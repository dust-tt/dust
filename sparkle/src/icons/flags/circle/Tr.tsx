import type { SVGProps } from "react";
import * as React from "react";

const SvgTr = (props: SVGProps<SVGSVGElement>) => (
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
      d="M10 20c5.523 0 10-4.477 10-10S15.523 0 10 0 0 4.477 0 10s4.477 10 10 10"
    />
    <path
      fill="#F0F0F0"
      d="m9.591 8.171.82 1.13 1.33-.43-.822 1.13.82 1.13-1.328-.432-.822 1.13.001-1.397-1.328-.433 1.329-.43z"
    />
    <path
      fill="#F0F0F0"
      d="M7.35 12.826a2.826 2.826 0 1 1 1.345-5.312 3.478 3.478 0 1 0 0 4.973c-.4.216-.858.34-1.345.34"
    />
  </svg>
);
export default SvgTr;
