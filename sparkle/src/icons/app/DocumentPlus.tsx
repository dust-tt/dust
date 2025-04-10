import type { SVGProps } from "react";
import * as React from "react";
const SvgDocumentPlus = (props: SVGProps<SVGSVGElement>) => (
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
      fillRule="evenodd"
      d="M14 2H4v20h16V9h-6V2ZM8 13h3v-3h2v3h3v2h-3v3h-2v-3H8v-2Z"
      clipRule="evenodd"
    />
    <path fill="#111418" d="M20 7h-4V3l4 4Z" />
  </svg>
);
export default SvgDocumentPlus;
