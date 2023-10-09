import type { SVGProps } from "react";
import * as React from "react";
const SvgCard = (props: SVGProps<SVGSVGElement>) => (
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
      d="M22.005 11v9a1 1 0 0 1-1 1h-18a1 1 0 0 1-1-1v-9h20Zm0-4h-20V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v3Z"
    />
  </svg>
);
export default SvgCard;
