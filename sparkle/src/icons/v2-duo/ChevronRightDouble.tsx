import type { SVGProps } from "react";
import * as React from "react";

const SvgChevronRightDouble = (props: SVGProps<SVGSVGElement>) => (
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
      d="M5.269 6.268a1.034 1.034 0 0 1 1.463 0l5 5a1.034 1.034 0 0 1 0 1.463l-5 5a1.034 1.034 0 1 1-1.463-1.463L9.538 12 5.269 7.73a1.034 1.034 0 0 1 0-1.463"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M12.269 6.268a1.034 1.034 0 0 1 1.463 0l5 5a1.034 1.034 0 0 1 0 1.463l-5 5a1.034 1.034 0 1 1-1.463-1.463L16.538 12 12.269 7.73a1.034 1.034 0 0 1 0-1.463"
    />
  </svg>
);
export default SvgChevronRightDouble;
