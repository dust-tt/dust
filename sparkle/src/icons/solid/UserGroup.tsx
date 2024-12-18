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
      d="M17 8A5 5 0 1 1 7 8a5 5 0 0 1 10 0M4 22a8 8 0 1 1 16 0zM5.223 6.24A7 7 0 0 0 5 8c0 1.936.786 3.689 2.057 4.956A3.5 3.5 0 0 1 5.224 6.24M19 8a6.98 6.98 0 0 1-2.056 4.956q.271.044.556.044a3.5 3.5 0 0 0 1.277-6.76C18.922 6.803 19 7.392 19 8M.174 22a6.5 6.5 0 0 1 5.797-7.979A9.98 9.98 0 0 0 2 22zM22 22h1.826a6.5 6.5 0 0 0-5.797-7.979A9.98 9.98 0 0 1 22 22"
    />
  </svg>
);
export default SvgUserGroup;
