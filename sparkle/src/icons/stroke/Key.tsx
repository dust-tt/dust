import type { SVGProps } from "react";
import * as React from "react";
const SvgKey = (props: SVGProps<SVGSVGElement>) => (
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
      d="m10.758 11.828 7.849-7.849 1.414 1.414-1.414 1.414 2.474 2.475-1.414 1.415-2.475-2.475-1.414 1.414 2.121 2.121-1.414 1.414-2.121-2.12-2.192 2.191a5.002 5.002 0 0 1-7.708 6.293 5 5 0 0 1 6.294-7.707Zm-.637 6.293A3 3 0 1 0 5.88 13.88a3 3 0 0 0 4.242 4.242Z"
    />
  </svg>
);
export default SvgKey;
