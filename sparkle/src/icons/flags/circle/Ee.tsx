import type { SVGProps } from "react";
import * as React from "react";

const SvgEe = (props: SVGProps<SVGSVGElement>) => (
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
      d="M0 10c0 1.223.22 2.395.622 3.478l9.378.435 9.378-.435A10 10 0 0 0 20 10c0-1.223-.22-2.395-.622-3.478L10 6.087l-9.378.435A10 10 0 0 0 0 10"
    />
    <path
      fill="#0052B4"
      d="M10 0C5.7 0 2.033 2.714.62 6.522h18.756A10 10 0 0 0 10 0"
    />
    <path fill="#F0F0F0" d="M19.377 13.478H.621a10.004 10.004 0 0 0 18.756 0" />
  </svg>
);
export default SvgEe;
