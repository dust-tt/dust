import type { SVGProps } from "react";
import * as React from "react";

const SvgDe = (props: SVGProps<SVGSVGElement>) => (
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
      d="M.621 13.478a10.004 10.004 0 0 0 18.756 0L10 12.608z"
    />
    <path
      fill="#000"
      d="M10 0C5.7 0 2.033 2.714.62 6.522l9.378.87 9.378-.87A10 10 0 0 0 10 0"
    />
    <path
      fill="#D80027"
      d="M.622 6.522A10 10 0 0 0 0 10c0 1.223.22 2.395.622 3.478h18.756A10 10 0 0 0 20 10c0-1.223-.22-2.395-.622-3.478z"
    />
  </svg>
);
export default SvgDe;
