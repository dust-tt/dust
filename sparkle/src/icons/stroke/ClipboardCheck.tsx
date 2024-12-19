import type { SVGProps } from "react";
import * as React from "react";
const SvgClipboardCheck = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#000"
      fillRule="evenodd"
      d="M7 2v2H4.993a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h14.014a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H17V2H7ZM5 6h2v2h10V6h2v15H5V6Zm4 0V4h6v2H9Zm2 9.5 4.5-4.5 1.5 1.5-6 6-4-4L8.5 13l2.5 2.5Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgClipboardCheck;
