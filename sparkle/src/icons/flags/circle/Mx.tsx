import type { SVGProps } from "react";
import * as React from "react";

const SvgMx = (props: SVGProps<SVGSVGElement>) => (
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
      d="M20 10A10 10 0 0 0 14.348.992v18.016A10 10 0 0 0 20 10"
    />
    <path
      fill="#6DA544"
      d="M0 10a10 10 0 0 0 5.652 9.008V.992A10 10 0 0 0 0 10M7.39 10a2.609 2.609 0 0 0 5.218 0v-.87H7.391z"
    />
    <path
      fill="#FF9811"
      d="M13.478 8.26h-2.609a.87.87 0 1 0-1.739 0H6.521c0 .481.419.87.899.87h-.029c0 .48.39.87.87.87 0 .48.389.87.87.87h1.738c.48 0 .87-.39.87-.87.48 0 .87-.39.87-.87h-.03c.48 0 .899-.389.899-.87"
    />
  </svg>
);
export default SvgMx;
