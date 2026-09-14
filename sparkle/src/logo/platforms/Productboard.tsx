import type { SVGProps } from "react";
import * as React from "react";

const SvgProductboard = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="#FF2638" d="m8 12 8 8H0z" />
    <path fill="#FFC600" d="m0 4 8 8 8-8z" />
    <path fill="#0079F2" d="m8 12 8 8 8-8-8-8z" />
  </svg>
);
export default SvgProductboard;
