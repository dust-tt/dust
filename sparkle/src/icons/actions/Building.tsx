import type { SVGProps } from "react";
import * as React from "react";
const SvgBuilding = (props: SVGProps<SVGSVGElement>) => (
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
      d="M21 19h2v2H1v-2h2V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v15h4v-8h-2V9h3a1 1 0 0 1 1 1v9ZM5 5v14h8V5H5Zm2 6h4v2H7v-2Zm0-4h4v2H7V7Z"
    />
  </svg>
);
export default SvgBuilding;
