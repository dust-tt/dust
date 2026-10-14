import type { SVGProps } from "react";
import * as React from "react";

const SvgGy = (props: SVGProps<SVGSVGElement>) => (
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
      fill="#6DA544"
      d="M10 0C8.232 0 6.572.46 5.13 1.265v17.47A9.95 9.95 0 0 0 10 20c5.523 0 10-4.477 10-10S15.523 0 10 0"
    />
    <path
      fill="#F0F0F0"
      d="M5.16 1.248a10 10 0 0 0-1.59 1.093L11.23 10l-7.66 7.659-.164-.141c.537.47 1.124.885 1.753 1.234L20 10z"
    />
    <path
      fill="#FFDA44"
      d="M4.315 1.773a10 10 0 0 0-.876.681L10 10l-6.562 7.546q.42.364.877.681L18.288 10z"
    />
    <path
      fill="#000"
      d="M3.57 2.341q-.333.28-.641.588L9.13 10 2.93 17.071q.308.307.642.588L11.229 10z"
    />
    <path
      fill="#D80027"
      d="M2.929 2.929c-3.905 3.905-3.905 10.237 0 14.142L10 10z"
    />
  </svg>
);
export default SvgGy;
