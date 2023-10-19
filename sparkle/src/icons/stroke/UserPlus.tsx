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
      fillRule="evenodd"
      d="M9 13A5 5 0 1 0 9 3a5 5 0 0 0 0 10Zm0-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
      clipRule="evenodd"
    />
    <path
      fill="currentColor"
      d="M1 22a8 8 0 1 1 16 0h-2a6 6 0 0 0-12 0H1ZM18 12V9h2v3h3v2h-3v3h-2v-3h-3v-2h3Z"
    />
  </svg>
);
export default SvgUserPlus;
