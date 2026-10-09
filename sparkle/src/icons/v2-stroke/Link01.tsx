import type { SVGProps } from "react";
import * as React from "react";

const SvgLink01 = (props: SVGProps<SVGSVGElement>) => (
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
      d="M4.904 10.561a1.035 1.035 0 0 1 1.464 1.464l-1.414 1.414a3.965 3.965 0 0 0 5.608 5.607l1.414-1.414a1.035 1.035 0 0 1 1.463 1.464l-1.414 1.414a6.036 6.036 0 0 1-8.535-8.535zm9.865-2.793a1.035 1.035 0 0 1 1.463 1.464l-7 7a1.035 1.035 0 0 1-1.463-1.464zM11.976 3.49a6.036 6.036 0 0 1 8.535 8.535l-1.414 1.414a1.035 1.035 0 0 1-1.464-1.464l1.414-1.414a3.965 3.965 0 0 0-5.607-5.607l-1.415 1.414a1.035 1.035 0 0 1-1.463-1.464z"
    />
  </svg>
);
export default SvgLink01;
