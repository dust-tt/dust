import type { SVGProps } from "react";
import * as React from "react";
const SvgBank = (props: SVGProps<SVGSVGElement>) => (
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
      d="M2 20h20v2H2v-2Zm2-8h2v7H4v-7Zm5 0h2v7H9v-7Zm4 0h2v7h-2v-7Zm5 0h2v7h-2v-7ZM2 7l10-5 10 5v4H2V7Zm2 1.236V9h16v-.764l-8-4-8 4ZM12 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"
    />
  </svg>
);
export default SvgBank;
