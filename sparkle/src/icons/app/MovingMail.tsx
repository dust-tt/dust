import type { SVGProps } from "react";
import * as React from "react";
const SvgMovingMail = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="#111418" d="M2 6.76V20h20V6.76l-10 9.091-10-9.09Z" />
    <path fill="#111418" d="M22 4.058V4H2v.058l10 9.09 10-9.09Z" />
  </svg>
);
export default SvgMovingMail;
