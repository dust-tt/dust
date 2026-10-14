import type { SVGProps } from "react";
import * as React from "react";

const SvgSi = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#F0F0F0"
      d="M10 20c5.523 0 10-4.477 10-10S15.523 0 10 0 0 4.477 0 10s4.477 10 10 10"
    />
    <path
      fill="#0052B4"
      d="M19.378 6.522H8.696V3.913H3.478v2.609H.622A10 10 0 0 0 0 10c0 1.223.22 2.395.622 3.478l9.378.87 9.378-.87A10 10 0 0 0 20 10c0-1.223-.22-2.395-.622-3.478"
    />
    <path
      fill="#D80027"
      d="M10 20c4.299 0 7.964-2.714 9.377-6.522H.621A10 10 0 0 0 10 20"
    />
    <path
      fill="#F0F0F0"
      d="M3.479 6.522v.87C3.479 9.387 6.087 10 6.087 10s2.609-.612 2.609-2.609v-.87l-.87.87-1.739-1.304-1.739 1.304z"
    />
  </svg>
);
export default SvgSi;
