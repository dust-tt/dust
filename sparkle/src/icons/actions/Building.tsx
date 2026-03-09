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
      fill="currentColor"
      d="M21 19h2v2H1v-2h2V3h12v16h4v-8h-4V9h6zM5 5v14h8V5zm2 6h4v2H7zm0-4h4v2H7z"
    />
  </svg>
);
export default SvgBuilding;
