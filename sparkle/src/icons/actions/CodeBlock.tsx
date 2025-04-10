import type { SVGProps } from "react";
import * as React from "react";
const SvgCodeBlock = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#111418"
      d="m3.414 6 2.293-2.293-1.414-1.414L.586 6l3.707 3.707 1.414-1.414L3.414 6Zm6.172 0L7.293 3.707l1.414-1.414L12.414 6 8.707 9.707 7.293 8.293 9.586 6ZM14 3h8v18H2v-9h2v7h16V5h-6V3Z"
    />
  </svg>
);
export default SvgCodeBlock;
