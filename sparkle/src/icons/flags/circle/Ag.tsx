import type { SVGProps } from "react";
import * as React from "react";

const SvgAg = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#0052B4"
      d="M0 10c0 .685.07 1.354.2 2l9.8.609L19.8 12a10 10 0 0 0 0-4L10 7.391.2 8c-.13.646-.2 1.315-.2 2"
    />
    <path
      fill="#F0F0F0"
      d="M19.8 12H.202c.927 4.564 4.962 8 9.8 8s8.873-3.436 9.8-8"
    />
    <path
      fill="#000"
      d="M.201 8h19.6c-.927-4.564-4.962-8-9.8-8S1.128 3.436.2 8"
    />
    <path
      fill="#FFDA44"
      d="M14.348 8H5.652l1.777-.836-.946-1.72 1.929.369.244-1.949L10 5.297l1.344-1.433.244 1.949 1.93-.37-.947 1.721z"
    />
    <path
      fill="#A2001D"
      d="M0 10c0 5.523 4.477 10 10 10L2 4a9.96 9.96 0 0 0-2 6M10 20c5.523 0 10-4.477 10-10a9.96 9.96 0 0 0-2-6z"
    />
  </svg>
);
export default SvgAg;
