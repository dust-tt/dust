import type { SVGProps } from "react";
import * as React from "react";

const SvgTd = (props: SVGProps<SVGSVGElement>) => (
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
      d="M10 0C8.777 0 7.605.22 6.522.622L6.087 10l.435 9.378A10 10 0 0 0 10 20c1.223 0 2.395-.22 3.478-.622L13.913 10 13.478.622A10 10 0 0 0 10 0"
    />
    <path
      fill="#D80027"
      d="M20 10c0-4.3-2.713-7.965-6.521-9.378v18.756A10 10 0 0 0 20 10"
    />
    <path fill="#0052B4" d="M6.522 19.378V.622a10.004 10.004 0 0 0 0 18.756" />
  </svg>
);
export default SvgTd;
