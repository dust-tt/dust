import type { SVGProps } from "react";
import * as React from "react";

const SvgUnderline01 = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M7 4v6a5 5 0 0 0 10 0V4M5 20h14"
    />
  </svg>
);
export default SvgUnderline01;
