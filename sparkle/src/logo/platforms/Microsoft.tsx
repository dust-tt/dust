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
    <path fill="#F25022" d="M2 2h9.5v9.5H2z" />
    <path fill="#00A4EF" d="M2 12.5h9.5V22H2z" />
    <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" />
    <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" />
  </svg>
);
export default SvgMicrosoft;
