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
      d="M23 21h-3V2H4v19H1v2h22zM8 6h3v2H8zm0 4h3v2H8zm0 4h3v2H8zm5 0h3v2h-3zm0-4h3v2h-3zm0-4h3v2h-3zm-1 12h4v3h-4zm-4 0h2v3H8z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgCompany;
