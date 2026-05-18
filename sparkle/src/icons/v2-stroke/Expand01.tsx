import type { SVGProps } from "react";
import * as React from "react";

const SvgExpand01 = (props: SVGProps<SVGSVGElement>) => (
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
      d="M9.269 13.269a1.034 1.034 0 1 1 1.462 1.462l-5.233 5.234H9a1.035 1.035 0 0 1 0 2.07H3A1.035 1.035 0 0 1 1.965 21v-6a1.035 1.035 0 0 1 2.07 0v3.502zM22.035 9a1.035 1.035 0 0 1-2.07 0V5.498l-5.234 5.233A1.034 1.034 0 1 1 13.27 9.27l5.233-5.234H15a1.035 1.035 0 0 1 0-2.07h6c.572 0 1.035.463 1.035 1.035z"
    />
  </svg>
);
export default SvgExpand01;
