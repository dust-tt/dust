import type { SVGProps } from "react";
import * as React from "react";

const SvgMz = (props: SVGProps<SVGSVGElement>) => (
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
      fill="#FFDA44"
      d="M5.406 13.913 2.93 17.071a10.002 10.002 0 0 0 16.275-3.158z"
    />
    <path
      fill="#496E2D"
      d="M19.22 6.123A10.002 10.002 0 0 0 2.93 2.93l2.504 3.194z"
    />
    <path
      fill="#000"
      d="M2.174 7.355v5.254h17.482C19.88 11.777 20 10.903 20 10c0-.916-.123-1.802-.354-2.645z"
    />
    <path
      fill="#A2001D"
      d="M2.929 2.929c-3.905 3.905-3.905 10.237 0 14.142L10 10z"
    />
    <path
      fill="#FFDA44"
      d="m4.048 7.391.647 1.993h2.096l-1.696 1.232.648 1.993-1.695-1.232-1.696 1.232L3 10.616 1.305 9.384H3.4z"
    />
    <path fill="#F0F0F0" d="M2.152 10h3.79v1.74h-3.79z" />
    <path
      fill="#000"
      d="m6.66 8.006-.616-.615L4.046 9.39 2.048 7.391l-.614.615 2 1.996-2 2 .614.607 1.998-1.995 1.998 1.995.615-.607-2-2z"
    />
  </svg>
);
export default SvgMz;
