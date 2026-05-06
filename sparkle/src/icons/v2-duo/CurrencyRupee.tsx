import type { SVGProps } from "react";
import * as React from "react";

const SvgCurrencyRupee = (props: SVGProps<SVGSVGElement>) => (
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
      d="M18 6.965a1.035 1.035 0 0 1 0 2.07H6a1.035 1.035 0 0 1 0-2.07z"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M18 1.965a1.035 1.035 0 0 1 0 2.07h-4.342c.93 1.128 1.377 2.561 1.377 3.965 0 1.47-.49 2.975-1.512 4.125-1.039 1.17-2.575 1.91-4.523 1.91h-.39l6.599 6.211a1.035 1.035 0 0 1-1.418 1.508l-8.5-8A1.036 1.036 0 0 1 6 11.964h3c1.386 0 2.35-.508 2.977-1.214.644-.725.988-1.72.988-2.75s-.344-2.025-.988-2.75c-.589-.662-1.472-1.15-2.722-1.209L9 4.035H6a1.035 1.035 0 0 1 0-2.07z"
    />
  </svg>
);
export default SvgCurrencyRupee;
