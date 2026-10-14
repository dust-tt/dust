import type { SVGProps } from "react";
import * as React from "react";

const SvgEh = (props: SVGProps<SVGSVGElement>) => (
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
      d="M.992 5.652A9.96 9.96 0 0 0 0 10a9.96 9.96 0 0 0 .992 4.348l9.008.87 9.008-.87A9.96 9.96 0 0 0 20 10a9.96 9.96 0 0 0-.992-4.348L10 4.782z"
    />
    <path
      fill="#496E2D"
      d="M.992 14.348A10 10 0 0 0 10 20a10 10 0 0 0 9.007-5.652z"
    />
    <path
      fill="#000"
      d="M.992 5.652h18.015A10 10 0 0 0 10 0 10 10 0 0 0 .992 5.652"
    />
    <path
      fill="#D80027"
      d="M2.929 2.929c-3.905 3.905-3.905 10.237 0 14.142L10 10zM12.61 10A3.044 3.044 0 0 1 15 7.027a3.043 3.043 0 1 0 0 5.945A3.044 3.044 0 0 1 12.61 10"
    />
    <path
      fill="#D80027"
      d="m15.127 8.043.432 1.33h1.397l-1.13.82.432 1.329-1.13-.821-1.13.82.431-1.328-1.13-.82h1.397z"
    />
  </svg>
);
export default SvgEh;
