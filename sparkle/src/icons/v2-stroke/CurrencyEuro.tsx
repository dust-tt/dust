import type { SVGProps } from "react";
import * as React from "react";

const SvgCurrencyEuro = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="currentColor"
      d="M3.965 12q0-.49.049-.965H3a1.035 1.035 0 0 1 0-2.07h1.462c1.268-3.778 4.834-6.5 9.038-6.5 2.352 0 4.507.853 6.17 2.265a1.035 1.035 0 1 1-1.34 1.578 7.43 7.43 0 0 0-4.83-1.773 7.46 7.46 0 0 0-6.82 4.43H13a1.035 1.035 0 0 1 0 2.07H6.099a8 8 0 0 0-.064.965q.001.49.064.965H13a1.035 1.035 0 0 1 0 2.07H6.68a7.46 7.46 0 0 0 6.82 4.43 7.43 7.43 0 0 0 4.83-1.773 1.035 1.035 0 1 1 1.34 1.578 9.5 9.5 0 0 1-6.17 2.265c-4.204 0-7.77-2.722-9.038-6.5H3a1.035 1.035 0 0 1 0-2.07h1.014a10 10 0 0 1-.05-.965"
    />
  </svg>
);
export default SvgCurrencyEuro;
