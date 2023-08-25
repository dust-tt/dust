import * as React from "react";
import type { SVGProps } from "react";
const SvgChevronUp = (props: SVGProps<SVGSVGElement>) => (
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
      d="M12 11.5 7.5 16l-2-2L12 7.5l6.5 6.5-2 2-4.5-4.5Z"
    />
  </svg>
);
export default SvgChevronUp;
