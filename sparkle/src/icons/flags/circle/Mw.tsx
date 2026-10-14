import type { SVGProps } from "react";
import * as React from "react";

const SvgMw = (props: SVGProps<SVGSVGElement>) => (
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
      d="M0 10c0 1.223.22 2.395.622 3.478l9.378.435 9.378-.435A10 10 0 0 0 20 10c0-1.223-.22-2.395-.622-3.478L10 6.087l-9.378.435A10 10 0 0 0 0 10"
    />
    <path
      fill="#000"
      d="M10 0C5.7 0 2.033 2.714.62 6.522h18.756A10 10 0 0 0 10 0"
    />
    <path fill="#496E2D" d="M19.377 13.478H.621a10.004 10.004 0 0 0 18.756 0" />
    <path
      fill="#D80027"
      d="m12.99 4.783-1.222-.575.65-1.183-1.326.254-.168-1.34-.923.986-.924-.986-.168 1.34-1.326-.254.65 1.183-1.221.575z"
    />
  </svg>
);
export default SvgMw;
