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
      fill="currentColor"
      fillRule="evenodd"
      d="M15 2H3.993A.993.993 0 0 0 3 2.992v18.016a1 1 0 0 0 .993.992h16.014a.993.993 0 0 0 .993-.992V9h-6V2ZM8 13h3v-3h2v3h3v2h-3v3h-2v-3H8v-2Z"
      clipRule="evenodd"
    />
    <path fill="currentColor" d="M21 7h-4V3l4 4Z" />
  </svg>
);
export default SvgDocumentPlus;
