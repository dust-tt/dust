import type { SVGProps } from "react";
import * as React from "react";

const SvgChevronSelectorVertical = (props: SVGProps<SVGSVGElement>) => (
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
      d="M16.269 14.269a1.034 1.034 0 1 1 1.463 1.462l-5 5a1.034 1.034 0 0 1-1.463 0l-5-5a1.034 1.034 0 1 1 1.462-1.463L12 18.539zM11.347 3.197a1.035 1.035 0 0 1 1.385.072l5 5a1.034 1.034 0 1 1-1.463 1.462L12 5.463 7.731 9.73A1.034 1.034 0 1 1 6.27 8.27l5-5z"
    />
  </svg>
);
export default SvgChevronSelectorVertical;
