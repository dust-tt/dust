import type { SVGProps } from "react";
import * as React from "react";
const SvgSave = (props: SVGProps<SVGSVGElement>) => (
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
      d="M7 19v-6h10v6h2V7.828L16.172 5H5v14h2ZM17 3l4 4v14H3V3h14ZM9 15v4h6v-4H9Z"
    />
  </svg>
);
export default SvgSave;
