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
      d="M7 3v3H4.01c-.557 0-1.007.448-1.007 1L3 21c0 .555.45 1 1.007 1h11.986C16.55 22 17 21.552 17 21v-3h3a1 1 0 0 0 1-1V6l-4-4H8a1 1 0 0 0-1 1ZM5 20l.002-12H12v3h3v9H5Zm12-4h2V7h-3V4H9v2h4l4 4v6Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgDocumentDuplicate;
