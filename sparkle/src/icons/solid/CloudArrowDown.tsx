import * as React from "react";
import type { SVGProps } from "react";
const SvgCloudArrowDown = (props: SVGProps<SVGSVGElement>) => (
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
      d="M1 12.5a8.5 8.5 0 0 0 8 8.485V21h8v-.019a6.5 6.5 0 0 0-.285-12.978A8.5 8.5 0 0 0 1 12.5ZM16 14l-4 4-4-4h3v-4h2v4h3Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgCloudArrowDown;
