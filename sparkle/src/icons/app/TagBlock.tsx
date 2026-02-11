import type { SVGProps } from "react";
import * as React from "react";

const SvgTagBlock = (props: SVGProps<SVGSVGElement>) => (
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
      d="M7 22H2l1-3h5l-1 3Zm15-5H5v-2h17v2Zm0-4H5v-2h17v2Zm0-4H5V7h17v2ZM7 5H2l1-3h5L7 5Z"
    />
  </svg>
);
export default SvgTagBlock;
