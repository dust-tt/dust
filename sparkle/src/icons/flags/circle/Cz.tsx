import type { SVGProps } from "react";
import * as React from "react";

const SvgCz = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#F0F0F0"
      d="M10 20c5.523 0 10-4.477 10-10S15.523 0 10 0 0 4.477 0 10s4.477 10 10 10"
    />
    <path
      fill="#D80027"
      d="M9.131 10s-6.195 7.073-6.201 7.071A9.97 9.97 0 0 0 10 20c5.524 0 10-4.477 10-10z"
    />
    <path
      fill="#0052B4"
      d="M2.929 2.929c-3.905 3.905-3.905 10.237 0 14.142L10 10z"
    />
  </svg>
);
export default SvgCz;
