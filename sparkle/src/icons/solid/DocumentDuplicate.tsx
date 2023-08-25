import * as React from "react";
import type { SVGProps } from "react";
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
      d="M7 6V3a1 1 0 0 1 1-1h9l4 4v11a1 1 0 0 1-1 1h-3v3c0 .552-.45 1-1.007 1H4.007A1.001 1.001 0 0 1 3 21l.003-14c0-.552.45-1 1.006-1H7Zm12 10h-2v-4h-6V6H9V4h7v3h3v9Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgDocumentDuplicate;
