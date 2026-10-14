import type { SVGProps } from "react";
import * as React from "react";

const SvgCf = (props: SVGProps<SVGSVGElement>) => (
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
      fill="#0052B4"
      d="M18.784 5.217A10.02 10.02 0 0 0 12.609.344l-.435 4.873zM1.217 5.217h6.61L7.392.344a10.02 10.02 0 0 0-6.175 4.873"
    />
    <path
      fill="#6DA544"
      d="M12.174 10v4.783h6.61A9.96 9.96 0 0 0 20 10zM7.826 10H0c0 1.732.44 3.362 1.216 4.783h6.61z"
    />
    <path
      fill="#FFDA44"
      d="M1.217 14.783a10.02 10.02 0 0 0 6.175 4.873l.435-4.262zM12.609 19.656a10.02 10.02 0 0 0 6.175-4.873l-6.61.61z"
    />
    <path
      fill="#FFDA44"
      d="m12.174 15.394 6.61-.611h-6.61zM7.827 14.783h-6.61l6.61.61z"
    />
    <path
      fill="#D80027"
      d="M10 0c-.903 0-1.778.12-2.61.344v19.312A10 10 0 0 0 10 20c.902 0 1.776-.12 2.608-.344V.343A10 10 0 0 0 9.999 0"
    />
    <path
      fill="#FFDA44"
      d="m5.38 2.174.269.83h.873l-.706.513.27.83-.707-.512-.706.513.27-.83-.707-.514h.873z"
    />
  </svg>
);
export default SvgCf;
