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
      fillRule="evenodd"
      d="M8.108 3a3 3 0 0 0-2.544 1.41l-3.75 6a3 3 0 0 0 0 3.18l3.75 6A3 3 0 0 0 8.108 21H22V3H8.108Zm2.063 4.757 2.828 2.829 2.829-2.829 1.414 1.415L14.413 12l2.829 2.828-1.414 1.415-2.829-2.829-2.828 2.829-1.414-1.415L11.585 12 8.757 9.172l1.414-1.415Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgBackspace;
