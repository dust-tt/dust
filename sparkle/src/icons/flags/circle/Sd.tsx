import type { SVGProps } from "react";
import * as React from "react";

const SvgSd = (props: SVGProps<SVGSVGElement>) => (
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
      fill="#000"
      d="M.992 14.348A10 10 0 0 0 10 20a10 10 0 0 0 9.007-5.652z"
    />
    <path
      fill="#D80027"
      d="M.992 5.652h18.015A10 10 0 0 0 10 0 10 10 0 0 0 .992 5.652"
    />
    <path
      fill="#496E2D"
      d="M2.929 2.929c-3.905 3.905-3.905 10.237 0 14.142L10 10.001z"
    />
  </svg>
);
export default SvgSd;
