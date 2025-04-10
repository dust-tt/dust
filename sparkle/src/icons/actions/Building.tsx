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
      d="M21 19h2v2H1v-2h2V3h12v16h4v-8h-4V9h6v10ZM5 5v14h8V5H5Zm2 6h4v2H7v-2Zm0-4h4v2H7V7Z"
    />
  </svg>
);
export default SvgBuilding;
