import type { SVGProps } from "react";
import * as React from "react";
const SvgD = (props: SVGProps<SVGSVGElement>) => (
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
      d="M12 3a9 9 0 1 1 0 18H3V3h9Zm0 16a7 7 0 1 0 0-14v14Z"
    />
  </svg>
);
export default SvgD;
