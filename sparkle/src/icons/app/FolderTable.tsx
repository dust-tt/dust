import type { SVGProps } from "react";
import * as React from "react";
const SvgFolderTable = (props: SVGProps<SVGSVGElement>) => (
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
      d="M22 6H11.414L9.901 4.12A3 3 0 0 0 7.563 3H2v18h20V6Zm-6 12H8V9h8v9Zm-4.4-6.3V9.9H8.8v1.8h2.8Zm-2.8.9v1.8h2.8v-1.8H8.8Zm2.8 2.7H8.8v1.8h2.8v-1.8Zm3.6 0h-2.8v1.8h2.8v-1.8Zm-2.8-.9h2.8v-1.8h-2.8v1.8Zm2.8-2.7V9.9h-2.8v1.8h2.8Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgFolderTable;
