import type { SVGProps } from "react";
import * as React from "react";
const SvgGoogleSpreadsheet = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="#E2F78C" d="m14 2 6 6h-6V2Z" />
    <path
      fill="#6AA668"
      d="M4 4a2 2 0 0 1 2-2h8v4a2 2 0 0 0 2 2h4v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Z"
    />
    <path fill="#fff" d="M8 11h8v1H8z" />
    <path fill="#fff" d="M15 11h1v7h-1zM11.5 11h1v7h-1zM8 11h1v7H8z" />
    <path fill="#fff" d="M8 17h8v1H8zM8 13h8v1H8zM8 15h8v1H8z" />
  </svg>
);
export default SvgGoogleSpreadsheet;
