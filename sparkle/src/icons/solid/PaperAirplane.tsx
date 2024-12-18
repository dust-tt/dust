import type { SVGProps } from "react";
import * as React from "react";
const SvgPaperAirplane = (props: SVGProps<SVGSVGElement>) => (
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
      d="M16 23c-1.411-2.82-4.23-8.461-4.23-8.461L14 10l-4.5 2.4L1 9l21-7q-3.003 10.5-6 21"
    />
  </svg>
);
export default SvgPaperAirplane;
