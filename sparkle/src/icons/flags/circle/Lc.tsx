import type { SVGProps } from "react";
import * as React from "react";

const SvgLc = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#338AF3"
      d="M10 20c5.523 0 10-4.477 10-10S15.523 0 10 0 0 4.477 0 10s4.477 10 10 10"
    />
    <path fill="#F3F3F3" d="M6.305 13.478h7.391L10 4.783z" />
    <path fill="#333" d="m7.588 12.609 2.411-5.485 2.412 5.485z" />
    <path fill="#FFDA44" d="M6.305 13.478h7.391L10 10z" />
  </svg>
);
export default SvgLc;
