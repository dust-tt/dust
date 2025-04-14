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
    <path
      fill="currentColor"
      d="M20 22v-8h-2v6H6v-6H4v8h16ZM18 6h2V2H4v4h2V4h12v2Z"
    />
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M2 7h20v6H2V7Zm2 2h16v2H4V9Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgScan;
