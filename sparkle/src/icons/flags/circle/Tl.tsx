import type { SVGProps } from "react";
import * as React from "react";

const SvgTl = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#FFDA44"
      d="M10 20c5.523 0 10-4.477 10-10S15.523 0 10 0 0 4.477 0 10s4.477 10 10 10"
    />
    <path
      fill="#D80027"
      d="M10 0C7.55 0 5.308.88 3.57 2.341L14.347 10 3.57 17.659A9.96 9.96 0 0 0 10 20c5.522 0 10-4.477 10-10S15.521 0 10 0"
    />
    <path
      fill="#000"
      d="M2.929 2.929c-3.905 3.905-3.905 10.237 0 14.142L10 10z"
    />
    <path
      fill="#F0F0F0"
      d="m2.772 7.71 1.522 1.44 1.84-1.003-.9 1.893 1.522 1.44-2.078-.27-.899 1.892-.385-2.06-2.078-.27 1.84-1.003z"
    />
  </svg>
);
export default SvgTl;
