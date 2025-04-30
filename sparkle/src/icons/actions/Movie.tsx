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
    <path fill="currentColor" d="M2 3h20v18H2V3Zm2 2v14h16V5H4Z" />
    <path fill="currentColor" d="m16 12-7 4V8l7 4Z" />
  </svg>
);
export default SvgMovie;
