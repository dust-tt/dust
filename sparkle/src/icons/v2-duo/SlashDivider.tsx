import type { SVGProps } from "react";
import * as React from "react";

const SvgSlashDivider = (props: SVGProps<SVGSVGElement>) => (
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
      d="M16.074 1.537a1.035 1.035 0 0 1 1.852.926l-10 20a1.035 1.035 0 0 1-1.852-.926z"
    />
  </svg>
);
export default SvgSlashDivider;
