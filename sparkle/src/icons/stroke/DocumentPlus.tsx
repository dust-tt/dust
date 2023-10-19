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
    <path fill="currentColor" d="M11 13v-3h2v3h3v2h-3v3h-2v-3H8v-2h3Z" />
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="m15 2 5 5v15H4V2h11Zm-1 2H6v16h12V8h-4V4Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgDocumentPlus;
