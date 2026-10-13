import type { SVGProps } from "react";
import * as React from "react";

const SvgGr = (props: SVGProps<SVGSVGElement>) => (
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
      fill="#338AF3"
      d="M10 7.391h9.656a10 10 0 0 0-1.124-2.608H10zM3.774 17.826h12.45a10 10 0 0 0 2.307-2.609H1.467a10 10 0 0 0 2.307 2.61M3.477 2.42a10 10 0 0 0-2.01 2.363h2.01zM10 10V7.391H6.087V10H3.478V7.391H.344A10 10 0 0 0 0 10c0 .903.12 1.777.344 2.609h19.312A10 10 0 0 0 20 10z"
    />
    <path
      fill="#338AF3"
      d="M10 0a10 10 0 0 0-3.912.795v3.988H10v-2.61h6.225A9.96 9.96 0 0 0 10 0"
    />
  </svg>
);
export default SvgGr;
