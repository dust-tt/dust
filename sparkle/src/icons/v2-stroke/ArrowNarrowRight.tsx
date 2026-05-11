import type { SVGProps } from "react";
import * as React from "react";

const SvgArrowNarrowRight = (props: SVGProps<SVGSVGElement>) => (
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
      d="M13.269 5.269a1.034 1.034 0 0 1 1.462 0l6 6a1.034 1.034 0 0 1 0 1.462l-6 6a1.034 1.034 0 1 1-1.462-1.463l4.233-4.233H4a1.035 1.035 0 0 1 0-2.07h13.502L13.269 6.73a1.034 1.034 0 0 1 0-1.462"
    />
  </svg>
);
export default SvgArrowNarrowRight;
