import type { SVGProps } from "react";
import * as React from "react";

const SvgCh = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#D80027"
      d="M10 20c5.523 0 10-4.477 10-10S15.523 0 10 0 0 4.477 0 10s4.477 10 10 10"
    />
    <path
      fill="#F0F0F0"
      d="M15.218 8.26H11.74V4.784H8.26V8.26H4.783v3.478h3.478v3.478h3.479V11.74h3.478z"
    />
  </svg>
);
export default SvgCh;
