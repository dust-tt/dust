import type { SVGProps } from "react";
import * as React from "react";

const SvgDoc = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#4BABFF"
      d="M4 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"
    />
    <path
      fill="#fff"
      d="M7 11h10v1H7zM7 17h8v1H7zM7 13h10v1H7zM7 9h10v1H7zM7 15h10v1H7z"
    />
  </svg>
);
export default SvgDoc;
