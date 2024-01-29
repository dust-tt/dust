import type { SVGProps } from "react";
import * as React from "react";
const SvgBackspace = (props: SVGProps<SVGSVGElement>) => (
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
      d="m15.828 7.757-2.829 2.829-2.828-2.829-1.414 1.415L11.585 12l-2.828 2.828 1.414 1.415 2.828-2.829 2.829 2.829 1.414-1.415L14.413 12l2.829-2.828-1.414-1.415Z"
    />
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M8.108 3a3 3 0 0 0-2.544 1.41l-3.75 6a3 3 0 0 0 0 3.18l3.75 6A3 3 0 0 0 8.108 21H22V3H8.108ZM7.26 5.47A1 1 0 0 1 8.108 5H20v14H8.108a1 1 0 0 1-.848-.47l-3.75-6a1 1 0 0 1 0-1.06l3.75-6Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgBackspace;
