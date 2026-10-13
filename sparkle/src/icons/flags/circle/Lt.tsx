import type { SVGProps } from "react";
import * as React from "react";

const SvgLt = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#6DA544"
      d="M19.378 13.478A10 10 0 0 0 20 10c0-1.223-.22-2.395-.622-3.478L10 5.652l-9.378.87A10 10 0 0 0 0 10c0 1.223.22 2.395.622 3.478l9.378.87z"
    />
    <path fill="#FFDA44" d="M19.377 6.522a10.004 10.004 0 0 0-18.756 0z" />
    <path
      fill="#D80027"
      d="M10 20c4.299 0 7.964-2.714 9.377-6.522H.621A10 10 0 0 0 10 20"
    />
  </svg>
);
export default SvgLt;
