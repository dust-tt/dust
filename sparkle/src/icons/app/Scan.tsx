import type { SVGProps } from "react";
import * as React from "react";
const SvgScan = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="#111418" d="M20 22v-7H4v7h16ZM4 5h16V2H4v3Z" />
    <path
      fill="#111418"
      fillRule="evenodd"
      d="M2 7h20v6H2V7Zm2 2h16v2H4V9Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgScan;
