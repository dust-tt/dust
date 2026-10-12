import type { SVGProps } from "react";
import * as React from "react";

const SvgSc = (props: SVGProps<SVGSVGElement>) => (
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
      d="M16.75 2.623A9.96 9.96 0 0 0 10 0a10 10 0 0 0-1.258.079L3.913 5.652.316 12.505c.233.9.588 1.752 1.046 2.536L10 10z"
    />
    <path
      fill="#6DA544"
      d="m18.325 15.54-13.991 2.7A9.95 9.95 0 0 0 9.999 20a9.99 9.99 0 0 0 8.326-4.46"
    />
    <path
      fill="#D80027"
      d="M16.75 2.624 1.368 15.05c.403.686.884 1.32 1.433 1.889L20 10a9.97 9.97 0 0 0-3.25-7.376"
    />
    <path
      fill="#0052B4"
      d="M0 10c0 .865.11 1.704.316 2.505L8.742.078C3.813.697 0 4.903 0 10"
    />
  </svg>
);
export default SvgSc;
