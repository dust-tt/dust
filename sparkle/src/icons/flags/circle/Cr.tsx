import type { SVGProps } from "react";
import * as React from "react";

const SvgCr = (props: SVGProps<SVGSVGElement>) => (
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
      fill="#D80027"
      d="M19.378 6.522H.622A10 10 0 0 0 0 10c0 1.223.22 2.395.622 3.478h18.756A10 10 0 0 0 20 10c0-1.223-.22-2.395-.622-3.478"
    />
    <path
      fill="#0052B4"
      d="M10 0a9.98 9.98 0 0 0-7.58 3.478h15.16A9.98 9.98 0 0 0 10 0M17.58 16.522H2.42A9.98 9.98 0 0 0 10 20a9.98 9.98 0 0 0 7.58-3.478"
    />
  </svg>
);
export default SvgCr;
