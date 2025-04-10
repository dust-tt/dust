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
      fill="#111418"
      d="M7 4V2h10v2h2.007a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H4.993a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2H7Zm0 2H5v15h14V6h-2v2H7V6Zm2-2v2h6V4H9Z"
    />
  </svg>
);
export default SvgClipboard;
