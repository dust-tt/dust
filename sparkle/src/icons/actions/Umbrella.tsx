import type { SVGProps } from "react";
import * as React from "react";
const SvgUmbrella = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#111418"
      d="M12.998 2.05c5.053.501 9 4.765 9 9.95v1h-9v6a2 2 0 0 0 4 0v-1h2v1a4 4 0 1 1-8 0v-6h-9v-1c0-5.185 3.947-9.449 9-9.95V2a1 1 0 0 1 2 0v.05ZM19.936 11A8.001 8.001 0 0 0 4.06 11h15.876Z"
    />
  </svg>
);
export default SvgUmbrella;
