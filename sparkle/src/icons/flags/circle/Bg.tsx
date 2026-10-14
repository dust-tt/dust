import type { SVGProps } from "react";
import * as React from "react";

const SvgBg = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#496E2D"
      d="M20 10c0-1.223-.22-2.395-.622-3.478L10 6.087l-9.378.435A10 10 0 0 0 0 10c0 1.223.22 2.395.622 3.478l9.378.435 9.378-.435A10 10 0 0 0 20 10"
    />
    <path
      fill="#D80027"
      d="M10 20c4.299 0 7.964-2.714 9.377-6.522H.621A10 10 0 0 0 10 20"
    />
    <path fill="#F0F0F0" d="M.621 6.522h18.756a10.004 10.004 0 0 0-18.756 0" />
  </svg>
);
export default SvgBg;
