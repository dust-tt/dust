import type { SVGProps } from "react";
import * as React from "react";

const SvgCg = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#FFDA44"
      d="m5.421 18.892 7.347-6.125 6.125-7.346a10.04 10.04 0 0 0-4.307-4.31L7.234 7.233 1.11 14.585a10.04 10.04 0 0 0 4.31 4.307"
    />
    <path
      fill="#D80027"
      d="M17.07 17.071c3.156-3.155 3.761-7.893 1.819-11.656L5.414 18.89c3.764 1.942 8.502 1.336 11.657-1.819"
    />
    <path
      fill="#6DA544"
      d="M2.929 2.929C-.226 6.084-.831 10.822 1.11 14.585L14.585 1.11C10.822-.832 6.084-.226 2.93 2.93"
    />
  </svg>
);
export default SvgCg;
