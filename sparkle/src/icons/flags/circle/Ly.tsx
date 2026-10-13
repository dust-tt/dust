import type { SVGProps } from "react";
import * as React from "react";

const SvgLy = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#000"
      d="M.992 5.652A9.96 9.96 0 0 0 0 10a9.96 9.96 0 0 0 .992 4.348l9.008.87 9.008-.87A9.96 9.96 0 0 0 20 10a9.96 9.96 0 0 0-.992-4.348L10 4.782z"
    />
    <path
      fill="#496E2D"
      d="M.992 14.348A10 10 0 0 0 10 20a10 10 0 0 0 9.007-5.652z"
    />
    <path
      fill="#D80027"
      d="M.992 5.652h18.015A10 10 0 0 0 10 0 10 10 0 0 0 .992 5.652"
    />
    <path
      fill="#F0F0F0"
      d="m12.328 8.171.82 1.131 1.329-.43L13.655 10l.82 1.13-1.328-.432-.822 1.13.001-1.397-1.328-.433 1.329-.43z"
    />
    <path
      fill="#F0F0F0"
      d="M10.089 12.826a2.826 2.826 0 1 1 1.344-5.312 3.478 3.478 0 1 0 0 4.973c-.4.216-.858.34-1.344.34"
    />
  </svg>
);
export default SvgLy;
