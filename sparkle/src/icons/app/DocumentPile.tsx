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
    <path fill="currentColor" d="M8 2h6v6h6v10H8c-.088 0-.002-14.165 0-16Z" />
    <path fill="currentColor" d="M6 7H4v15h12v-2H6V7ZM16 6V2l4 4h-4Z" />
  </svg>
);
export default SvgDocumentPile;
