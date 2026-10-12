import type { SVGProps } from "react";
import * as React from "react";

const SvgEg = (props: SVGProps<SVGSVGElement>) => (
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
      d="M10 0C5.7 0 2.033 2.714.62 6.522h18.756A10 10 0 0 0 10 0"
    />
    <path
      fill="#000"
      d="M10 20c4.299 0 7.964-2.714 9.377-6.522H.621A10 10 0 0 0 10 20"
    />
    <path
      fill="#FF9811"
      d="M13.478 8.913h-2.609a.87.87 0 1 0-1.739 0H6.521c0 .48.419.87.899.87h-.029c0 .48.39.87.87.87 0 .48.389.869.87.869h1.738c.48 0 .87-.39.87-.87.48 0 .87-.39.87-.87h-.03c.48 0 .899-.389.899-.869"
    />
  </svg>
);
export default SvgEg;
