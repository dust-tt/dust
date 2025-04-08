import type { SVGProps } from "react";
import * as React from "react";
const SvgUserGroup = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="currentColor"
      d="M17 8A5 5 0 1 1 7 8a5 5 0 0 1 10 0ZM4 22a8 8 0 1 1 16 0H4ZM5.223 6.24A7.012 7.012 0 0 0 5 8c0 1.936.786 3.689 2.057 4.956A3.5 3.5 0 0 1 5.224 6.24ZM19 8a6.978 6.978 0 0 1-2.056 4.956 3.5 3.5 0 0 0 1.834-6.716c.145.563.222 1.152.222 1.76ZM.174 22a6.5 6.5 0 0 1 5.797-7.979A9.984 9.984 0 0 0 2 22H.174ZM22 22h1.826a6.5 6.5 0 0 0-5.797-7.979A9.984 9.984 0 0 1 22 22Z"
    />
  </svg>
);
export default SvgUserGroup;
