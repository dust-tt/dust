import type { SVGProps } from "react";
import * as React from "react";

const SvgMn = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#0052B4"
      d="M10 20c1.223 0 2.395-.22 3.478-.622L13.913 10 13.478.622A10 10 0 0 0 10 0C8.777 0 7.605.22 6.522.622L6.087 10l.435 9.378A10 10 0 0 0 10 20"
    />
    <path
      fill="#A2001D"
      d="M0 10c0 4.3 2.714 7.965 6.522 9.378V.622A10 10 0 0 0 0 10M13.479.622v18.756C17.287 17.965 20 14.3 20 10S17.287 2.035 13.48.622"
    />
    <path
      fill="#FFDA44"
      d="M4.782 10h.87v3.478h-.87zM1.305 10h.87v3.478h-.87zM3.478 12.174a.87.87 0 1 0 0-1.74.87.87 0 0 0 0 1.74M3.479 8.696a.435.435 0 1 0 0-.87.435.435 0 0 0 0 .87M2.608 12.609h1.74v.87h-1.74zM2.608 9.13h1.74V10h-1.74zM3.478 5.217l.308.948h.997l-.807.586.308.947-.806-.585-.806.585.308-.947-.806-.586h.996z"
    />
  </svg>
);
export default SvgMn;
