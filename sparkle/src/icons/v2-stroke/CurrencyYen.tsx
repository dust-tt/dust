import type { SVGProps } from "react";
import * as React from "react";

const SvgCurrencyYen = (props: SVGProps<SVGSVGElement>) => (
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
      d="M10.965 20.5v-3.965H7a1.035 1.035 0 0 1 0-2.07h3.965v-1.93H6a1.035 1.035 0 0 1 0-2.07h3.825L4.696 4.152a1.036 1.036 0 0 1 1.608-1.305l5.695 7.011 5.697-7.01a1.036 1.036 0 0 1 1.608 1.304l-5.13 6.313H18a1.035 1.035 0 0 1 0 2.07h-4.965v1.93H17a1.035 1.035 0 0 1 0 2.07h-3.965V20.5a1.035 1.035 0 0 1-2.07 0"
    />
  </svg>
);
export default SvgCurrencyYen;
