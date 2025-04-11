import type { SVGProps } from "react";
import * as React from "react";
const SvgShirt = (props: SVGProps<SVGSVGElement>) => (
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
      d="M12.998 20h6v-4h-4v-2h4V6h-2v5l-4-1.6V20Zm-2 0V9.4l-4 1.6V6h-2v14h6Zm-4-16V3h10v1h3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-16a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3Zm5 4 3.5-3h-7l3.5 3Z"
    />
  </svg>
);
export default SvgShirt;
