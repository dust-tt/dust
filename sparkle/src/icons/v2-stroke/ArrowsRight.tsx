import type { SVGProps } from "react";
import * as React from "react";

const SvgArrowsRight = (props: SVGProps<SVGSVGElement>) => (
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
      d="M15.269 12.269a1.034 1.034 0 0 1 1.462 0l4 4a1.034 1.034 0 0 1 0 1.462l-4 4a1.034 1.034 0 1 1-1.462-1.463l2.233-2.233H4a1.035 1.035 0 0 1 0-2.07h13.502l-2.233-2.234a1.034 1.034 0 0 1 0-1.463m-5-10a1.034 1.034 0 0 1 1.462 0l4 4a1.034 1.034 0 0 1 0 1.462l-4 4a1.034 1.034 0 1 1-1.462-1.463l2.233-2.233H4a1.035 1.035 0 0 1 0-2.07h8.502L10.269 3.73a1.034 1.034 0 0 1 0-1.462"
    />
  </svg>
);
export default SvgArrowsRight;
