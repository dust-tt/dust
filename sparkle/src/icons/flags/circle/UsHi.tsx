import type { SVGProps } from "react";
import * as React from "react";

const SvgUsHi = (props: SVGProps<SVGSVGElement>) => (
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
      d="M10 20c2.536 0 4.851-.944 6.614-2.5H3.387A9.96 9.96 0 0 0 10 20"
    />
    <path
      fill="#0052B4"
      d="M.314 12.5A10 10 0 0 0 1.338 15H18.66a10 10 0 0 0 1.023-2.5L10 11.74zM19.685 7.5A10 10 0 0 0 18.662 5L10 4.783V0c-.742 0-1.466.081-2.163.235C7.823.238 1.305 5.38 1.305 10c.166.029 8.695.87 8.695.87V7.5z"
    />
    <path
      fill="#F0F0F0"
      d="M10 6.24v-5H6.833L7.837.234A10.01 10.01 0 0 0 0 10h5.065V8.007L7.078 10h3.578L6.833 6.24z"
    />
    <path
      fill="#D80027"
      d="M10.005 10 6.244 6.24H5.065L8.826 10H3.804V5h14.858a10 10 0 0 0-2.048-2.5H3.804v-.349a10 10 0 0 0-2.5 2.91V10H0c0 .863.11 1.701.315 2.5h19.37c.206-.8.315-1.637.315-2.5z"
    />
  </svg>
);
export default SvgUsHi;
