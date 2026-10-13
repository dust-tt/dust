import type { SVGProps } from "react";
import * as React from "react";

const SvgIc = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#338AF3"
      d="M10 0C8.779 0 7.607.22 6.524.622v18.756A10 10 0 0 0 10 20c1.223 0 2.395-.22 3.478-.622L13.5 10 13.48.622A10 10 0 0 0 10 0"
    />
    <path
      fill="#FFDA44"
      d="M20 10c0-4.3-2.713-7.965-6.521-9.378v18.756A10 10 0 0 0 20 10"
    />
    <path fill="#F0F0F0" d="M6.522 19.378V.622a10.004 10.004 0 0 0 0 18.756" />
  </svg>
);
export default SvgIc;
