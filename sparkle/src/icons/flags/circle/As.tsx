import type { SVGProps } from "react";
import * as React from "react";

const SvgAs = (props: SVGProps<SVGSVGElement>) => (
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
      fill="#0052B4"
      d="M14.851 1.254A9.96 9.96 0 0 0 10 0C4.478 0 0 4.476 0 9.999l6.957-3.477zM0 10.001C0 15.524 4.478 20 10 20c1.76 0 3.415-.456 4.851-1.254l-7.894-5.268z"
    />
    <path
      fill="#D80027"
      d="M15.685 1.773a10 10 0 0 0-.834-.518L0 9.999V10l14.851 8.744q.43-.239.834-.518L1.712 10z"
    />
    <path
      fill="#A2001D"
      d="M17.39 9.627H16.2a.946.946 0 0 0-.06-1.274.946.946 0 0 0 0-1.338l-.021.022c.37-.37.392-.991.022-1.36l-5.354 5.353c.37.37.958.365 1.328-.004l.103-.095 2.564-.233v1.103h.87v-1.182l1.304-.118z"
    />
    <path fill="#FFDA44" d="m10.87 12.174-.87-.435.87-.435h5.652v.87z" />
  </svg>
);
export default SvgAs;
