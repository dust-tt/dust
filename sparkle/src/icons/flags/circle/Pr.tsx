import type { SVGProps } from "react";
import * as React from "react";

const SvgPr = (props: SVGProps<SVGSVGElement>) => (
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
      d="M10 0a9.99 9.99 0 0 0-8 4h16a9.99 9.99 0 0 0-8-4M10 20a9.99 9.99 0 0 0 8-4H2a9.99 9.99 0 0 0 8 4M0 10c0 .685.07 1.354.2 2h19.6a10 10 0 0 0 0-4H.2c-.13.646-.2 1.315-.2 2"
    />
    <path
      fill="#0052B4"
      d="M2.929 2.929c-3.905 3.905-3.905 10.237 0 14.142L10 10z"
    />
    <path
      fill="#F0F0F0"
      d="m4.048 7.391.647 1.993h2.096l-1.696 1.232.648 1.993-1.695-1.232-1.696 1.232L3 10.616 1.305 9.384H3.4z"
    />
  </svg>
);
export default SvgPr;
