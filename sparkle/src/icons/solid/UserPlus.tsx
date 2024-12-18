import type { SVGProps } from "react";
import * as React from "react";
const SvgUserPlus = (props: SVGProps<SVGSVGElement>) => (
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
      d="M14 8A5 5 0 1 1 4 8a5 5 0 0 1 10 0M1 22a8 8 0 1 1 16 0zM18 12V9h2v3h3v2h-3v3h-2v-3h-3v-2z"
    />
  </svg>
);
export default SvgUserPlus;
