import type { SVGProps } from "react";
import * as React from "react";
const SvgBold = (props: SVGProps<SVGSVGElement>) => (
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
      d="M5 21V3h6.638c4.317 0 6.613 1.496 6.613 4.868 0 2.13-1.272 3.549-3.493 3.828 2.72.279 4.242 1.901 4.242 4.36C19 19.352 16.68 21 12.537 21H5Zm3.244-10.445h3.294c2.121 0 3.394-.837 3.394-2.383 0-1.623-1.198-2.383-3.394-2.383H8.244v4.766Zm0 7.656h4.143c2.021 0 3.294-.862 3.294-2.51 0-1.673-1.248-2.56-3.294-2.56H8.244v5.07Z"
    />
  </svg>
);
export default SvgBold;
