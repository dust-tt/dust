import type { SVGProps } from "react";
import * as React from "react";
const SvgBarcode = (props: SVGProps<SVGSVGElement>) => (
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
      d="M2 4h2v16H2V4Zm4 0h1v16H6V4Zm2 0h2v16H8V4Zm3 0h2v16h-2V4Zm3 0h2v16h-2V4Zm3 0h1v16h-1V4Zm2 0h3v16h-3V4Z"
    />
  </svg>
);
export default SvgBarcode;
