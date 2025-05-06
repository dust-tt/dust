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
      d="M22.005 11v7a3 3 0 0 1-3 3h-14a3 3 0 0 1-3-3v-7h20Zm0-4h-20V6a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v1Z"
    />
  </svg>
);
export default SvgCard;
