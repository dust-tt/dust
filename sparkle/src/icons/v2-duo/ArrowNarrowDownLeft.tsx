import type { SVGProps } from "react";
import * as React from "react";

const SvgArrowNarrowDownLeft = (props: SVGProps<SVGSVGElement>) => (
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
      d="M17.269 5.269a1.034 1.034 0 1 1 1.463 1.462l-12 12a1.034 1.034 0 1 1-1.463-1.462z"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M4.965 10a1.035 1.035 0 0 1 2.07 0v6.965H14a1.035 1.035 0 0 1 0 2.07H6A1.035 1.035 0 0 1 4.965 18z"
    />
  </svg>
);
export default SvgArrowNarrowDownLeft;
