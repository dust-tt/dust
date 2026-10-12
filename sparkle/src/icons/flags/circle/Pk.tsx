import type { SVGProps } from "react";
import * as React from "react";

const SvgPk = (props: SVGProps<SVGSVGElement>) => (
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
      fill="#F0F0F0"
      d="M0 10a10 10 0 0 0 5.217 8.784V1.216A10 10 0 0 0 0 10"
    />
    <path
      fill="#496E2D"
      d="M10 0C8.266 0 6.637.44 5.216 1.216v17.568A9.96 9.96 0 0 0 9.999 20c5.523 0 10-4.477 10-10S15.522 0 10 0"
    />
    <path
      fill="#F0F0F0"
      d="M14.276 11.654a2.826 2.826 0 1 1-2.021-5.094 3.478 3.478 0 1 0 2.912 4.03c-.197.41-.496.779-.89 1.064M14.222 6.522l.713.768.95-.44-.51.915.713.768-1.028-.203-.51.915-.126-1.04-1.027-.203.95-.44z"
    />
  </svg>
);
export default SvgPk;
