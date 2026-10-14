import type { SVGProps } from "react";
import * as React from "react";

const SvgZa = (props: SVGProps<SVGSVGElement>) => (
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
      d="M2.929 17.071c-3.905-3.905-3.905-10.237 0-14.142L8.696 10z"
    />
    <path
      fill="#FFDA44"
      d="m8.695 10-7.37-4.98q-.343.597-.602 1.24L4.453 10l-3.73 3.74q.26.643.602 1.24z"
    />
    <path
      fill="#6DA544"
      d="M19.916 8.696H8.696L2.929 2.929A10 10 0 0 0 1.327 5.02L6.297 10l-4.97 4.98c.44.766.98 1.47 1.602 2.09l5.767-5.766h11.22a10 10 0 0 0 0-2.608"
    />
    <path
      fill="#0052B4"
      d="M3.912 17.933A9.96 9.96 0 0 0 10.001 20c4.62 0 8.508-3.134 9.655-7.391H9.236z"
    />
    <path
      fill="#D80027"
      d="M19.656 7.391C18.509 3.134 14.621 0 10.001 0a9.96 9.96 0 0 0-6.089 2.067l5.324 5.324z"
    />
  </svg>
);
export default SvgZa;
