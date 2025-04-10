import type { SVGProps } from "react";
import * as React from "react";
const SvgPrinter = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#111418"
      d="M18 2v5h1a3 3 0 0 1 3 3v9h-4v3H6v-3H2v-9a3 3 0 0 1 3-3h1V2h12Zm-2 15H8v3h8v-3Zm4-7a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v7h2v-2h12v2h2v-7ZM8 10v2H5v-2h3Zm8-6H8v3h8V4Z"
    />
  </svg>
);
export default SvgPrinter;
