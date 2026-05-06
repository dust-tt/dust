import type { SVGProps } from "react";
import * as React from "react";

const SvgCurrencyDollar = (props: SVGProps<SVGSVGElement>) => (
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
      d="M10.965 22V2a1.035 1.035 0 0 1 2.07 0v20a1.035 1.035 0 0 1-2.07 0"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M16.965 8A2.965 2.965 0 0 0 14 5.035h-4a2.965 2.965 0 1 0 0 5.93h4a5.035 5.035 0 0 1 0 10.07h-4A5.035 5.035 0 0 1 4.965 16a1.035 1.035 0 0 1 2.07 0A2.965 2.965 0 0 0 10 18.965h4a2.965 2.965 0 1 0 0-5.93h-4a5.035 5.035 0 0 1 0-10.07h4A5.035 5.035 0 0 1 19.035 8a1.035 1.035 0 0 1-2.07 0"
    />
  </svg>
);
export default SvgCurrencyDollar;
