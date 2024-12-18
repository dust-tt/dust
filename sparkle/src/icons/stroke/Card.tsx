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
      fillRule="evenodd"
      d="M22.005 6a3 3 0 0 0-3-3h-14a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3zm-18 6h16v6a1 1 0 0 1-1 1h-14a1 1 0 0 1-1-1zm16-6v2h-16V6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgCard;
