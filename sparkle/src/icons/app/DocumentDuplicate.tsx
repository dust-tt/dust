import type { SVGProps } from "react";
import * as React from "react";
const SvgDocumentDuplicate = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="currentColor" d="M13 6v4h4l-4-4Z" />
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M7 6V2h10l4 4v12h-4v4H3V6h4Zm12 10h-2v-4h-6V6H9V4h7v3h3v9Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgDocumentDuplicate;
