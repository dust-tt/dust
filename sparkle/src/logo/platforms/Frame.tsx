import type { SVGProps } from "react";
import * as React from "react";

const SvgFrame = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <rect width={20} height={16} x={2} y={4} fill="#A78BFA" rx={2} />
    <path
      fill="#fff"
      d="M18 18H6V6h12zm-3.518-2H16V8h-3.917zM8 13.624V16h4.917l-1.096-3.65zm0-1.582 3.39-1.13L10.517 8H8z"
    />
  </svg>
);
export default SvgFrame;
