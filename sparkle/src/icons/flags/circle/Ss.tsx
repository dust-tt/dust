import type { SVGProps } from "react";
import * as React from "react";

const SvgSs = (props: SVGProps<SVGSVGElement>) => (
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
      fill="#000"
      d="M19.22 6.123A10.002 10.002 0 0 0 2.93 2.93l2.504 3.194z"
    />
    <path
      fill="#496E2D"
      d="M5.462 13.84 2.93 17.07A9.97 9.97 0 0 0 10 20c4.162 0 7.73-2.543 9.236-6.16z"
    />
    <path
      fill="#A2001D"
      d="M2.174 7.355v5.254h17.482C19.88 11.777 20 10.903 20 10c0-.916-.123-1.802-.354-2.645z"
    />
    <path
      fill="#0052B4"
      d="M2.929 2.929c-3.905 3.905-3.905 10.237 0 14.142L10 10z"
    />
    <path
      fill="#FFDA44"
      d="m3.257 7.514 1.22 1.703 1.997-.635-1.242 1.688 1.22 1.703-1.988-.66L3.22 13l.014-2.096-1.989-.66 1.997-.635z"
    />
  </svg>
);
export default SvgSs;
