import type { SVGProps } from "react";
import * as React from "react";

const SvgTable = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#6AA668"
      d="M4 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"
    />
    <path
      fill="#FEFFF0"
      fillRule="evenodd"
      d="M18 18H6V8.5h12zM7 17h3v-1.5H7zm3.5 0h3v-1.5h-3zm3.5 0h3v-1.5h-3zm-7-2h3v-1.5H7zm3.5 0h3v-1.5h-3zm3.5 0h3v-1.5h-3zm-7-3.5V13h3v-1.5zm3.5 0V13h3v-1.5zm3.5 0V13h3v-1.5zM7 11h3V9.5H7zm3.5 0h3V9.5h-3zm3.5 0h3V9.5h-3z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgTable;
