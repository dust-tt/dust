import type { SVGProps } from "react";
import * as React from "react";
const SvgVidicon = (props: SVGProps<SVGSVGElement>) => (
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
      d="M17 9.2 23 5v14l-6-4.2V19H1V5h16v4.2Zm0 2.8c0 .225.11.435.294.564L21 15.16V8.84l-3.706 2.595A.689.689 0 0 0 17 12ZM3 7v10h12V7H3Zm1 2.5a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Z"
    />
  </svg>
);
export default SvgVidicon;
