import type { SVGProps } from "react";
import * as React from "react";

const SvgCa = (props: SVGProps<SVGSVGElement>) => (
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
      d="M20 10A10 10 0 0 0 14.348.992v18.016A10 10 0 0 0 20 10M0 10a10 10 0 0 0 5.652 9.008V.992A10 10 0 0 0 0 10M11.739 11.304l1.739-.87-.87-.434v-.87L10.87 10l.87-1.74h-.87L10 6.958 9.13 8.26h-.87L9.13 10l-1.739-.87V10l-.87.435 1.74.87-.435.869h1.739v1.304h.87v-1.304h1.739z"
    />
  </svg>
);
export default SvgCa;
