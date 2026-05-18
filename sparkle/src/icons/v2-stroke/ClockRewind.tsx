import type { SVGProps } from "react";
import * as React from "react";

const SvgClockRewind = (props: SVGProps<SVGSVGElement>) => (
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
      d="M20.701 10.465c.274 0 .538.11.732.304l1.999 2a1.035 1.035 0 1 1-1.464 1.462l-.15-.15c-.959 4.543-4.99 7.954-9.818 7.954-5.542 0-10.035-4.493-10.035-10.035S6.458 1.965 12 1.965a10.03 10.03 0 0 1 8.645 4.937 1.036 1.036 0 1 1-1.782 1.053 7.965 7.965 0 1 0 .862 5.982l-.293.295a1.035 1.035 0 0 1-1.464-1.464l2-2c.195-.194.459-.303.733-.303M10.965 7a1.035 1.035 0 0 1 2.07 0v4.445l2.54 1.694a1.035 1.035 0 0 1-1.15 1.722l-3-2a1.03 1.03 0 0 1-.46-.861z"
    />
  </svg>
);
export default SvgClockRewind;
