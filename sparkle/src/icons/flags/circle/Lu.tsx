import type { SVGProps } from "react";
import * as React from "react";

const SvgLu = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#F0F0F0"
      d="M10 20c5.523 0 10-4.477 10-10S15.523 0 10 0 0 4.477 0 10s4.477 10 10 10"
    />
    <path
      fill="#D80027"
      d="M10 0C5.7 0 2.035 2.714.622 6.522h18.756A10 10 0 0 0 10 0"
    />
    <path
      fill="#338AF3"
      d="M10 20c4.3 0 7.965-2.714 9.378-6.522H.622A10 10 0 0 0 10 20"
    />
  </svg>
);
export default SvgLu;
