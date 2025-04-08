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
      d="M2 7c3.333-2 6.666-4.001 10-6 3.334 1.999 6.667 4 10 6l-10 6L2 7Z"
      clipRule="evenodd"
    />
    <path
      fill="currentColor"
      d="M4.083 10.75 2 12l10 6 10-6-2.083-1.25L12 15.5l-7.917-4.75Z"
    />
    <path
      fill="currentColor"
      d="m2 17 2.083-1.25L12 20.5l7.917-4.75L22 17l-10 6-10-6Z"
    />
  </svg>
);
export default SvgSquare3Stack3D;
