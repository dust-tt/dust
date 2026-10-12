import type { SVGProps } from "react";
import * as React from "react";

const SvgDk = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#F0F0F0"
      d="M10 20c5.523 0 10-4.477 10-10S15.523 0 10 0 0 4.477 0 10s4.477 10 10 10"
    />
    <path
      fill="#D80027"
      d="M7.826 8.696h12.09C19.275 3.789 15.08 0 10 0c-.747 0-1.474.083-2.174.238zM5.217 8.696v-7.48a10 10 0 0 0-5.133 7.48zM5.217 11.304H.084a10 10 0 0 0 5.133 7.48zM7.826 11.304v8.458c.7.155 1.427.238 2.174.238 5.08 0 9.276-3.79 9.915-8.696z"
    />
  </svg>
);
export default SvgDk;
