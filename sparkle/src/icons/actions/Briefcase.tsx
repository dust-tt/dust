import type { SVGProps } from "react";
import * as React from "react";
const SvgBriefcase = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="currentColor" d="M7 10h2v7H7v-7ZM17 10h-2v7h2v-7Z" />
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M8 4v2H5a3 3 0 0 0-3 3v9a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V9a3 3 0 0 0-3-3h-3V4a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1Zm11 4a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h14Zm-9-2V5h4v1h-4Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgBriefcase;
