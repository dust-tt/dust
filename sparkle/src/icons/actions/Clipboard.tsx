import type { SVGProps } from "react";
import * as React from "react";
const SvgClipboard = (props: SVGProps<SVGSVGElement>) => (
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
      d="M15 2H9v3h6V2ZM7 7V4H5.993a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h12.014a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H17v3H7Zm11 2H6v12h12V9Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgClipboard;
