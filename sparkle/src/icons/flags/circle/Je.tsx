import type { SVGProps } from "react";
import * as React from "react";

const SvgJe = (props: SVGProps<SVGSVGElement>) => (
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
      fill="#D80027"
      d="M17.933 16.089 11.845 10l6.088-6.089a10 10 0 0 0-1.844-1.845L10 8.156 3.91 2.065a10 10 0 0 0-1.845 1.845L8.156 10l-6.09 6.089a10 10 0 0 0 1.845 1.845L10 11.843l6.089 6.09a10 10 0 0 0 1.844-1.845"
    />
    <path
      fill="#FFDA44"
      d="m8.26 3.043 1.74.435 1.739-.435V1.565l-.696.348L10 .87 8.956 1.913l-.695-.348z"
    />
    <path
      fill="#D80027"
      d="M8.26 3.043v1.088C8.26 5.46 10 5.87 10 5.87s1.739-.408 1.739-1.74V3.044z"
    />
  </svg>
);
export default SvgJe;
