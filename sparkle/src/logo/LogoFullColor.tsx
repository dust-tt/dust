import type { SVGProps } from "react";
import * as React from "react";
const SvgLogoFullColor = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 64 16"
    {...props}
  >
    <path fill="#FCD34D" d="M56 8h-8v8h8V8Z" />
    <path fill="#6EE7B7" d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16Z" />
    <path fill="#F9A8D4" d="M24 16a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />
    <path fill="#10B981" d="M8 0H0v16h8V0Z" />
    <path fill="#F87171" d="M32 0H16v8h16V0Z" />
    <path
      fill="#3B82F6"
      fillRule="evenodd"
      d="M40 8a4 4 0 0 1 0-8h24v8H40Z"
      clipRule="evenodd"
    />
    <path
      fill="#7DD3FC"
      fillRule="evenodd"
      d="M32 16V8h8a4 4 0 0 1 0 8h-8Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgLogoFullColor;
