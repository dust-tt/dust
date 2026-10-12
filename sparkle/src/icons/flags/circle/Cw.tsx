import type { SVGProps } from "react";
import * as React from "react";

const SvgCw = (props: SVGProps<SVGSVGElement>) => (
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
      d="M10 20c5.523 0 10-4.477 10-10S15.523 0 10 0 0 4.477 0 10s4.477 10 10 10"
    />
    <path
      fill="#0052B4"
      d="M10 20a9.99 9.99 0 0 0 8.016-4.021H1.982A9.99 9.99 0 0 0 10 20M20 10c0-5.523-4.477-10-10-10S0 4.477 0 10c0 1.182.206 2.317.583 3.37h18.834A10 10 0 0 0 20 10"
    />
    <path
      fill="#F0F0F0"
      d="m6.844 6.413.54 1.661H9.13L7.717 9.1l.54 1.661-1.413-1.026-1.412 1.026.54-1.66-1.413-1.027h1.746zM3.846 4.674l.324.997h1.048l-.848.615.324.997-.848-.616-.848.616.324-.997-.847-.615h1.047z"
    />
  </svg>
);
export default SvgCw;
