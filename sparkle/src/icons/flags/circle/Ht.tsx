import type { SVGProps } from "react";
import * as React from "react";

const SvgHt = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#A2001D"
      d="M20 10c0 5.523-4.477 10-10 10S0 15.523 0 10 10 0 10 0s10 4.477 10 10"
    />
    <path fill="#0052B4" d="M0 10C0 4.477 4.477 0 10 0s10 4.477 10 10" />
    <path fill="#F0F0F0" d="M13.478 12.609 10 12.174l-3.479.435V7.39h6.957z" />
    <path
      fill="#0052B4"
      d="M10 12.174a1.74 1.74 0 1 0 0-3.478 1.74 1.74 0 0 0 0 3.478"
    />
    <path
      fill="#A2001D"
      d="M10 11.304a.87.87 0 1 0 0-1.739.87.87 0 0 0 0 1.74"
    />
    <path fill="#6DA544" d="M8.695 8.26h2.609L10 9.566z" />
    <path fill="#FFDA44" d="M9.565 9.13h.87v2.61h-.87z" />
    <path fill="#6DA544" d="M11.391 11.478H8.608l-2.087 1.13h6.957z" />
  </svg>
);
export default SvgHt;
