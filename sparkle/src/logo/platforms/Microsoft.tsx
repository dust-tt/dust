import type { SVGProps } from "react";
import * as React from "react";
const SvgMicrosoft = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="#F25022" d="M3 3h8.5v8.5H3z" />
    <path fill="#00A4EF" d="M3 12.5h8.5V21H3z" />
    <path fill="#7FBA00" d="M12.5 3H21v8.5h-8.5z" />
    <path fill="#FFB900" d="M12.5 12.5H21V21h-8.5z" />
  </svg>
);
export default SvgMicrosoft;
