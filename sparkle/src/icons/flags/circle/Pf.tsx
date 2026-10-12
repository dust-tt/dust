import type { SVGProps } from "react";
import * as React from "react";

const SvgPf = (props: SVGProps<SVGSVGElement>) => (
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
      d="M1.216 5.217h17.568A10 10 0 0 0 10 0a10 10 0 0 0-8.784 5.217M10 20a10 10 0 0 0 8.784-5.217H1.216A10 10 0 0 0 10 20"
    />
    <path
      fill="#FFDA44"
      d="M13.478 10c0 1.921-1.557 3.044-3.478 3.044S6.52 11.92 6.52 10a3.478 3.478 0 1 1 6.957 0"
    />
    <path fill="#0052B4" d="M13.478 10a3.478 3.478 0 0 1-6.957 0" />
    <path
      fill="#D80027"
      d="M7.826 9.13h.87v1.74h-.87zM11.305 9.13h.87v1.74h-.87zM9.565 7.826h.87v3.044h-.87z"
    />
  </svg>
);
export default SvgPf;
