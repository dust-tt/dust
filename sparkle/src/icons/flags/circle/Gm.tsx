import type { SVGProps } from "react";
import * as React from "react";

const SvgGm = (props: SVGProps<SVGSVGElement>) => (
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
      fill="#A2001D"
      d="M10 0A10 10 0 0 0 .795 6.087h18.41A10 10 0 0 0 10 0"
    />
    <path
      fill="#496E2D"
      d="M10 20c4.134 0 7.682-2.509 9.205-6.087H.795A10 10 0 0 0 10 20"
    />
    <path
      fill="#0052B4"
      d="M19.656 7.391H.343A10 10 0 0 0 0 10c0 .903.12 1.777.344 2.609h19.312A10 10 0 0 0 20 10c0-.903-.12-1.777-.344-2.609"
    />
  </svg>
);
export default SvgGm;
