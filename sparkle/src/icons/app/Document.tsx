import type { SVGProps } from "react";
import * as React from "react";
const SvgDocument = (props: SVGProps<SVGSVGElement>) => (
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
      d="M20 9v13H4V2h9v7h7Z"
      clipRule="evenodd"
    />
    <path fill="currentColor" d="M20 7h-5V2.003L20 7Z" />
  </svg>
);
export default SvgDocument;
