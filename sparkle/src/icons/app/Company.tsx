import type { SVGProps } from "react";
import * as React from "react";
const SvgCompany = (props: SVGProps<SVGSVGElement>) => (
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
      d="M23 21h-3V2H4v19H1v2h22v-2ZM8 6h3v2H8V6Zm0 4h3v2H8v-2Zm0 4h3v2H8v-2Zm5 0h3v2h-3v-2Zm0-4h3v2h-3v-2Zm0-4h3v2h-3V6Zm-1 12h4v3h-4v-3Zm-4 0h2v3H8v-3Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgCompany;
