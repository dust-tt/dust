import type { SVGProps } from "react";
import * as React from "react";

const SvgTt = (props: SVGProps<SVGSVGElement>) => (
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
      d="M5.416 1.11A10 10 0 0 0 2.93 2.93 10 10 0 0 0 1.11 5.415l6.43 7.045 7.045 6.43a10 10 0 0 0 2.486-1.819 10 10 0 0 0 1.818-2.486L12.46 7.54z"
    />
    <path
      fill="#000"
      d="M17.07 17.071q.63-.631 1.123-1.336L4.264 1.805a10 10 0 0 0-2.46 2.46l13.93 13.93q.706-.494 1.336-1.124"
    />
    <path
      fill="#D80027"
      d="M2.929 17.071c3.155 3.155 7.893 3.76 11.656 1.819L1.11 5.415C-.832 9.178-.226 13.916 2.93 17.07M17.07 2.929C13.917-.226 9.179-.831 5.415 1.11L18.89 14.585c1.942-3.763 1.337-8.501-1.818-11.656"
    />
  </svg>
);
export default SvgTt;
