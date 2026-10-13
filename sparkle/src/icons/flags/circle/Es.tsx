import type { SVGProps } from "react";
import * as React from "react";

const SvgEs = (props: SVGProps<SVGSVGElement>) => (
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
      d="M0 10c0 1.223.22 2.395.622 3.478l9.378.87 9.378-.87A10 10 0 0 0 20 10c0-1.223-.22-2.395-.622-3.478L10 5.652l-9.378.87A10 10 0 0 0 0 10"
    />
    <path
      fill="#D80027"
      d="M19.378 6.522a10.004 10.004 0 0 0-18.756 0zM.622 13.478a10.004 10.004 0 0 0 18.756 0z"
    />
  </svg>
);
export default SvgEs;
