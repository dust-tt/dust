import type { SVGProps } from "react";
import * as React from "react";

const SvgAe = (props: SVGProps<SVGSVGElement>) => (
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
      fill="#000"
      d="m5.652 13.478.87 5.9a10.003 10.003 0 0 0 12.856-5.9z"
    />
    <path
      fill="#6DA544"
      d="m5.652 6.522.87-5.9a10.003 10.003 0 0 1 12.856 5.9z"
    />
    <path
      fill="#A2001D"
      d="M0 10c0 4.3 2.714 7.965 6.522 9.378V.622A10 10 0 0 0 0 10"
    />
  </svg>
);
export default SvgAe;
