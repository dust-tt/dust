import type { SVGProps } from "react";
import * as React from "react";

const SvgMv = (props: SVGProps<SVGSVGElement>) => (
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
    <path fill="#6DA544" d="M3.479 5.217h13.043v9.566H3.479z" />
    <path
      fill="#F0F0F0"
      d="M11.61 12.826a2.826 2.826 0 1 1 1.345-5.312 3.478 3.478 0 1 0 0 4.973c-.4.216-.858.34-1.345.34"
    />
  </svg>
);
export default SvgMv;
