import type { SVGProps } from "react";
import * as React from "react";

const SvgCurrencyEuro = (props: SVGProps<SVGSVGElement>) => (
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
      d="M13 12.965a1.035 1.035 0 0 1 0 2.07H3a1.035 1.035 0 0 1 0-2.07zm0-4a1.035 1.035 0 0 1 0 2.07H3a1.035 1.035 0 0 1 0-2.07z"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M3.965 12A9.535 9.535 0 0 1 19.67 4.73a1.035 1.035 0 1 1-1.34 1.578 7.43 7.43 0 0 0-4.83-1.773 7.465 7.465 0 1 0 0 14.93 7.43 7.43 0 0 0 4.83-1.773 1.035 1.035 0 1 1 1.34 1.578A9.535 9.535 0 0 1 3.965 12"
    />
  </svg>
);
export default SvgCurrencyEuro;
