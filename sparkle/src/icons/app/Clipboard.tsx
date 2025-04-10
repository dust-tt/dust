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
      d="M7 4v3h10V4h1.007a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H5.993a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2H7Zm2-2h6v3H9V2Z"
    />
  </svg>
);
export default SvgClipboard;
