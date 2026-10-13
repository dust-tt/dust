import type { SVGProps } from "react";
import * as React from "react";

const SvgMt = (props: SVGProps<SVGSVGElement>) => (
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
    <path fill="#D80027" d="M10 0c5.523 0 10 4.477 10 10s-4.477 10-10 10" />
    <path
      fill="#ACABB1"
      d="M6.956 3.913V2.609H5.652v1.304H4.348v1.304h1.304v1.305h1.304V5.217h1.305V3.913z"
    />
  </svg>
);
export default SvgMt;
