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
      d="M15 2H7v4H3v16h14v-4h4V8h-6V2Zm0 16H7c-.126 0 0-8.952 0-10H5v12h10v-2Z"
      clipRule="evenodd"
    />
    <path fill="currentColor" d="M17 2v4h4l-4-4Z" />
  </svg>
);
export default SvgDocumentPile;
