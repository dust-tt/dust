import type { SVGProps } from "react";
import * as React from "react";

const SvgCl = (props: SVGProps<SVGSVGElement>) => (
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
      d="M20 10c0 5.523-4.477 10-10 10S0 15.523 0 10s10 0 10 0z"
    />
    <path fill="#0052B4" d="M0 10C0 4.477 4.477 0 10 0v10z" />
    <path
      fill="#F0F0F0"
      d="M5.953 3.478 6.6 5.471h2.096L7 6.703l.647 1.993-1.695-1.232-1.695 1.232.647-1.993L3.21 5.47h2.095z"
    />
  </svg>
);
export default SvgCl;
