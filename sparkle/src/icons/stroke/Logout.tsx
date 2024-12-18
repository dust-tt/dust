import type { SVGProps } from "react";
import * as React from "react";
const SvgLogout = (props: SVGProps<SVGSVGElement>) => (
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
      d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2c2.55 0 4.877.955 6.644 2.526l-1.31 1.473h-.043a8 8 0 1 0 .001 12h.041l1.31 1.475A9.96 9.96 0 0 1 12 22"
    />
    <path fill="currentColor" d="M19 16v-3h-8v-2h8V8l5 4z" />
  </svg>
);
export default SvgLogout;
