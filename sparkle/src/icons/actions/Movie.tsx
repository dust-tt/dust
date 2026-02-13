import type { SVGProps } from "react";
import * as React from "react";

const SvgMovie = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="currentColor" d="M2 3h20v18H2zm2 2v14h16V5z" />
    <path fill="currentColor" d="m16 12-7 4V8z" />
  </svg>
);
export default SvgMovie;
