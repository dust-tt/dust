import type { SVGProps } from "react";
import * as React from "react";

const SvgSt = (props: SVGProps<SVGSVGElement>) => (
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
      fill="#6DA544"
      d="M6.087 6.522h13.291A10.004 10.004 0 0 0 2.93 2.929zM6.087 13.478h13.291A10.004 10.004 0 0 1 2.93 17.071z"
    />
    <path
      fill="#D80027"
      d="M2.929 2.929c-3.905 3.905-3.905 10.237 0 14.142L10 10z"
    />
    <path
      fill="#000"
      d="m12.698 8.26.431 1.33h1.397l-1.13.82.432 1.33-1.13-.822-1.13.821.431-1.328-1.13-.822h1.397zM17.046 8.26l.431 1.33h1.397l-1.13.82.432 1.33-1.13-.822-1.13.821.431-1.328-1.13-.822h1.397z"
    />
  </svg>
);
export default SvgSt;
