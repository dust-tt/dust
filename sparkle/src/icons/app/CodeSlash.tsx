import type { SVGProps } from "react";
import * as React from "react";
const SvgCodeSlash = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 25"
    {...props}
  >
    <path
      fill="currentColor"
      d="M24 12.063 18 18l-1.5-1.5 4.5-4.438L16.5 7.5 18 6l6 6.063Zm-21 0L7.5 16.5 6 18l-6-5.938L6 6l1.5 1.5L3 12.063ZM11 20H8.5L13 4h2.5L11 20Z"
    />
  </svg>
);
export default SvgCodeSlash;
