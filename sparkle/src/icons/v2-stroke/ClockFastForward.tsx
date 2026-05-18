import type { SVGProps } from "react";
import * as React from "react";

const SvgClockFastForward = (props: SVGProps<SVGSVGElement>) => (
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
      d="M1.965 12C1.965 6.458 6.458 1.965 12 1.965c5.128 0 9.355 3.847 9.958 8.812l.01-.008a1.035 1.035 0 1 1 1.464 1.462l-2 2a1.035 1.035 0 0 1-1.463.001l-2.001-2a1.035 1.035 0 0 1 1.464-1.464l.498.498A7.964 7.964 0 0 0 4.035 12a7.965 7.965 0 0 0 14.16 5.006 1.036 1.036 0 0 1 1.61 1.303A10.02 10.02 0 0 1 12 22.035C6.458 22.035 1.965 17.542 1.965 12m9-5a1.035 1.035 0 0 1 2.07 0v4.445l2.54 1.694a1.035 1.035 0 0 1-1.15 1.722l-3-2a1.03 1.03 0 0 1-.46-.861z"
    />
  </svg>
);
export default SvgClockFastForward;
