import type { SVGProps } from "react";
import * as React from "react";

const SvgGmail = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="#4285F4" d="M2.5 20.5H6V12L1 8.25V19c0 .83.673 1.5 1.5 1.5Z" />
    <path fill="#34A853" d="M18 20.5h3.5A1.5 1.5 0 0 0 23 19V8.25L18 12" />
    <path fill="#FBBC04" d="M18 5.5V12l5-3.75v-2c0-1.855-2.117-2.912-3.6-1.8" />
    <path fill="#EA4335" d="M6 12V5.5l6 4.5 6-4.5V12l-6 4.5" />
    <path
      fill="#C5221F"
      d="M1 6.25v2L6 12V5.5L4.6 4.45C3.115 3.338 1 4.395 1 6.25Z"
    />
  </svg>
);
export default SvgGmail;
