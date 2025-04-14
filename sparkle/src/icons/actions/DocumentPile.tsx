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
      d="M8 2h8l4 4v12H8V2Zm2.002 2L10 16h8V7h-3V4h-4.998Z"
      clipRule="evenodd"
    />
    <path fill="currentColor" d="M4 7h2v13h10v2H4V7Z" />
  </svg>
);
export default SvgDocumentPile;
