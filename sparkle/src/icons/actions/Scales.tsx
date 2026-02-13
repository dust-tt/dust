import type { SVGProps } from "react";
import * as React from "react";

const SvgScales = (props: SVGProps<SVGSVGElement>) => (
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
      d="m12.999 2-.001 1.278 5 1.668 3.633-1.21.632 1.896-3.031 1.011 3.095 8.512A5.98 5.98 0 0 1 17.998 17a5.98 5.98 0 0 1-4.328-1.845l3.094-8.512-3.766-1.256V19h4v2h-10v-2h4V5.387L7.232 6.643l3.095 8.512A5.98 5.98 0 0 1 6 17a5.98 5.98 0 0 1-4.33-1.845l3.095-8.512-3.03-1.01.632-1.898L6 4.945l4.999-1.667V2zm5 7.103-1.959 5.386c.588.331 1.258.511 1.959.511.7 0 1.37-.18 1.958-.51zm-12 0L4.04 14.489c.588.331 1.258.511 1.959.511.7 0 1.37-.18 1.958-.51z"
    />
  </svg>
);
export default SvgScales;
