import type { SVGProps } from "react";
import * as React from "react";

const SvgGoogleDoc = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="#9FDBFF" d="m14 2 6 6h-6z" />
    <path
      fill="#4BABFF"
      d="M4 5a3 3 0 0 1 3-3h7v3a3 3 0 0 0 3 3h3v11a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z"
    />
    <path fill="#fff" d="M8 11h8v1H8zM8 17h6v1H8zM8 13h8v1H8zM8 15h8v1H8z" />
  </svg>
);
export default SvgGoogleDoc;
