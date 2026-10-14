import type { SVGProps } from "react";
import * as React from "react";

const SvgXo = (props: SVGProps<SVGSVGElement>) => (
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
      d="M19.378 13.478A10 10 0 0 0 20 10c0-1.223-.22-2.395-.622-3.478L10 5.652l-9.378.87A10 10 0 0 0 0 10c0 1.223.22 2.395.622 3.478l9.378.87z"
    />
    <path
      fill="#FFDA44"
      d="M10 20c4.299 0 7.964-2.714 9.377-6.522H.621A10 10 0 0 0 10 20"
    />
    <path
      fill="#F0F0F0"
      d="M10 0C5.7 0 2.033 2.714.62 6.522h18.756A10 10 0 0 0 10 0"
    />
  </svg>
);
export default SvgXo;
