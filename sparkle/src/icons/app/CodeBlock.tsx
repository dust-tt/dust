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
      fill="currentColor"
      d="m3.414 7.99 2.293-2.293-1.414-1.415L.586 7.99l3.707 3.707 1.414-1.414L3.414 7.99Zm6.172 0L7.293 5.697l1.414-1.415 3.707 3.708-3.707 3.707-1.414-1.414L9.586 7.99Zm4.414-3h4.001a3 3 0 0 1 3 2.998c.001 3 .001 5.023 0 8.024a3 3 0 0 1-2.999 2.998H5.996a2.996 2.996 0 0 1-2.996-3v-3.015h2v3.015a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7.99a1 1 0 0 0-1-1h-4v-2Z"
    />
  </svg>
);
export default SvgCodeBlock;
