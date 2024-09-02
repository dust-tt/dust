import type { SVGProps } from "react";
import * as React from "react";
const SvgArrowLeftS = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="currentColor" d="m8 12 6-6v12l-6-6Z" />
  </svg>
);
export default SvgArrowLeftS;
