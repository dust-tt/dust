import type { SVGProps } from "react";
import * as React from "react";

const SvgSlide = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#FFBE2C"
      d="M20 4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"
    />
    <path fill="#fff" d="M6 7h12v2H6z" />
    <path fill="#fff" d="M17 8h1v8h-1zM6 8h1v8H6z" />
    <path fill="#fff" d="M6 15h12v2H6z" />
  </svg>
);
export default SvgSlide;
