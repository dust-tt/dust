import type { SVGProps } from "react";
import * as React from "react";

const SvgCi = (props: SVGProps<SVGSVGElement>) => (
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
      d="M10 20c1.224 0 2.396-.22 3.48-.622L13.913 10 13.479.622A10 10 0 0 0 10.001 0C8.778 0 7.606.22 6.523.622L6.088 10l.435 9.378A10 10 0 0 0 10 20"
    />
    <path
      fill="#FF9811"
      d="M0 10c0 4.3 2.714 7.965 6.522 9.378V.622A10 10 0 0 0 0 10"
    />
    <path fill="#6DA544" d="M13.479.622v18.756a10.004 10.004 0 0 0 0-18.756" />
  </svg>
);
export default SvgCi;
