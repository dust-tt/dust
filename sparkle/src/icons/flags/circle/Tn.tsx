import type { SVGProps } from "react";
import * as React from "react";

const SvgTn = (props: SVGProps<SVGSVGElement>) => (
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
      d="M10 14.783a4.783 4.783 0 1 0 0-9.565 4.783 4.783 0 0 0 0 9.565"
    />
    <path
      fill="#D80027"
      d="m10.59 8.171.82 1.13 1.329-.43-.822 1.13.82 1.13-1.328-.432-.822 1.13.001-1.397-1.328-.433 1.329-.43z"
    />
    <path
      fill="#D80027"
      d="M11.087 12.826a2.826 2.826 0 1 1 1.344-5.312 3.478 3.478 0 1 0 0 4.973c-.4.216-.858.34-1.344.34"
    />
  </svg>
);
export default SvgTn;
