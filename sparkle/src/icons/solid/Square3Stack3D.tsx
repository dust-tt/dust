import type { SVGProps } from "react";
import * as React from "react";
const SvgSquare3Stack3D = (props: SVGProps<SVGSVGElement>) => (
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
      d="M2 7q5-3 10-6 5 3 10 6l-10 6z"
      clipRule="evenodd"
    />
    <path
      fill="currentColor"
      d="M4.083 10.75 2 12l10 6 10-6-2.083-1.25L12 15.5z"
    />
    <path
      fill="currentColor"
      d="m2 17 2.083-1.25L12 20.5l7.917-4.75L22 17l-10 6z"
    />
  </svg>
);
export default SvgSquare3Stack3D;
