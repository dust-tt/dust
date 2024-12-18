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
      d="M8 6h3v2H8zM8 10h3v2H8zM8 14h3v2H8zM13 14h3v2h-3zM13 10h3v2h-3zM13 6h3v2h-3z"
    />
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M23 21h-3V2H4v19H1v2h22zM18 4v17h-2v-3h-4v3h-2v-3H8v3H6V4z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgCompany;
