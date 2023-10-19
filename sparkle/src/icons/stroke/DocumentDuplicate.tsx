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
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M7 6H3v16h14v-4h4V6l-4-4H7v4ZM5 20l.002-12H12v3h3v9H5Zm12-4h2V7h-3V4H9v2h4l4 4v6Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgDocumentDuplicate;
