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
      d="M20 8v14H4V2h9.997L20 8Zm-2 1h-5V4H6v16h12V9Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgDocument;
