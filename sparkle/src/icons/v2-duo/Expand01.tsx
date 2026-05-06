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
      d="M9.269 13.269a1.034 1.034 0 1 1 1.463 1.462l-7 7a1.034 1.034 0 1 1-1.463-1.463zm11-11a1.034 1.034 0 1 1 1.463 1.462l-7 7a1.034 1.034 0 1 1-1.463-1.463z"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M1.965 15a1.035 1.035 0 0 1 2.07 0v4.965H9a1.035 1.035 0 0 1 0 2.07H3A1.035 1.035 0 0 1 1.965 21zm18-6V4.035H15a1.035 1.035 0 0 1 0-2.07h6c.572 0 1.035.463 1.035 1.035v6a1.035 1.035 0 0 1-2.07 0"
    />
  </svg>
);
export default SvgExpand01;
