import type { SVGProps } from "react";
import * as React from "react";
const SvgFlag = (props: SVGProps<SVGSVGElement>) => (
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
      d="M10.586 3c.905 0 1.774.36 2.414 1 .64.64 1.509 1 2.414 1H21v13h-6.586c-.905 0-1.774-.36-2.414-1-.64-.64-1.509-1-2.414-1H5v6H3V3h7.586Zm1.178 3c-.64-.64-1.509-1-2.414-1H5v9h5.822c.905 0 1.774.36 2.414 1 .64.64 1.509 1 2.414 1H19V7h-4.822c-.905 0-1.774-.36-2.414-1Z"
    />
  </svg>
);
export default SvgFlag;
