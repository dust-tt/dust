import type { SVGProps } from "react";
import * as React from "react";

const SvgAz = (props: SVGProps<SVGSVGElement>) => (
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
      d="M20 10c0-1.223-.22-2.395-.622-3.478L10 6.087l-9.378.435A10 10 0 0 0 0 10c0 1.223.22 2.395.622 3.478l9.378.435 9.378-.435A10 10 0 0 0 20 10"
    />
    <path
      fill="#6DA544"
      d="M10 20c4.3 0 7.965-2.714 9.378-6.522H.622A10 10 0 0 0 10 20"
    />
    <path fill="#338AF3" d="M.622 6.522h18.756a10.004 10.004 0 0 0-18.756 0" />
    <path
      fill="#F0F0F0"
      d="M10.218 12.826a2.826 2.826 0 1 1 1.344-5.312 3.478 3.478 0 1 0 0 4.973c-.4.216-.858.34-1.345.34"
    />
    <path
      fill="#F0F0F0"
      d="m12.391 8.043.374 1.053 1.01-.48-.48 1.01 1.053.374-1.053.374.48 1.01-1.01-.48-.374 1.053-.374-1.053-1.01.48.48-1.01L10.435 10l1.052-.374-.48-1.01 1.01.48z"
    />
  </svg>
);
export default SvgAz;
