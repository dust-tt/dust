import type { SVGProps } from "react";
import * as React from "react";
const SvgTools = (props: SVGProps<SVGSVGElement>) => (
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
      d="M17 12.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9ZM12 21H2l5-8 5 8Zm5.938-14.91H22L17.062 12V7.91H13L17.938 2v4.09ZM11 11H3V3h8v8Z"
    />
  </svg>
);
export default SvgTools;
