import type { SVGProps } from "react";
import * as React from "react";

const SvgOm = (props: SVGProps<SVGSVGElement>) => (
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
      fill="#D80027"
      d="M0 10a10 10 0 0 0 5.217 8.784V1.216A10 10 0 0 0 0 10"
    />
    <path
      fill="#D80027"
      d="M19.378 13.478A10 10 0 0 0 20 10c0-1.223-.22-2.395-.622-3.478H.622A10 10 0 0 0 0 10c0 1.223.22 2.395.622 3.478l9.378.87z"
    />
    <path
      fill="#6DA544"
      d="M10 20c4.299 0 7.964-2.714 9.377-6.522H.621A10 10 0 0 0 10 20"
    />
    <path
      fill="#D80027"
      d="M0 10c0 4.62 3.134 8.508 7.391 9.656V.343C3.134 1.492 0 5.38 0 10"
    />
    <path
      fill="#F0F0F0"
      d="m6.117 4.4-.922-.922-.615.615-.615-.615-.922.923.615.614-.615.615.922.923.615-.615.615.615.922-.923-.615-.615z"
    />
  </svg>
);
export default SvgOm;
