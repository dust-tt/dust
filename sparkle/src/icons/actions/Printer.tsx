import type { SVGProps } from "react";
import * as React from "react";
const SvgPrinter = (props: SVGProps<SVGSVGElement>) => (
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
      d="M17 2a1 1 0 0 1 1 1v4h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-3v2a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-2H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h3V3a1 1 0 0 1 1-1h10Zm-1 15H8v3h8v-3Zm4-8H4v8h2v-1a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1h2V9ZM8 10v2H5v-2h3Zm8-6H8v3h8V4Z"
    />
  </svg>
);
export default SvgPrinter;
