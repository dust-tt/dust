import type { SVGProps } from "react";
import * as React from "react";

const SvgGoogleSlide = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="#FFE262" d="m14 2 6 6h-6z" />
    <path
      fill="#FFBE2C"
      d="M4 5a3 3 0 0 1 3-3h7v3a3 3 0 0 0 3 3h3v11a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z"
    />
    <path fill="#fff" d="M8 11h8v2H8z" />
    <path fill="#fff" d="M15 11h1v7h-1zM8 11h1v7H8z" />
    <path fill="#fff" d="M8 16h8v2H8z" />
  </svg>
);
export default SvgGoogleSlide;
