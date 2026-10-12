import type { SVGProps } from "react";
import * as React from "react";

const SvgMu = (props: SVGProps<SVGSVGElement>) => (
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
      d="m1.217 5.217 8.784.87 8.784-.87A10 10 0 0 0 10.001 0a10 10 0 0 0-8.784 5.217"
    />
    <path
      fill="#FFDA44"
      d="m1.216 14.783 8.784.87 8.784-.87A9.96 9.96 0 0 0 20 10l-10-.87L0 10c0 1.732.44 3.362 1.216 4.783"
    />
    <path
      fill="#0052B4"
      d="M1.216 5.217A9.96 9.96 0 0 0 0 10h20c0-1.732-.44-3.362-1.216-4.783H1.216"
    />
    <path
      fill="#6DA544"
      d="M10 20a10 10 0 0 0 8.785-5.217H1.217A10 10 0 0 0 10 20"
    />
  </svg>
);
export default SvgMu;
