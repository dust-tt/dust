import type { SVGProps } from "react";
import * as React from "react";
const SvgDocumentPile = (props: SVGProps<SVGSVGElement>) => (
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
      d="M7 2h10l4 4v12h-4v4H3V6h4V2Zm0 16h8v2H5V8h2v10ZM9.002 4 9 16h10V7h-3V4H9.002Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgDocumentPile;
